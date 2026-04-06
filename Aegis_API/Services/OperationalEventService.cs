using System.Text.Json;
using System.Text.Json.Serialization;
using Aegis_API.Models;
using StackExchange.Redis;

namespace Aegis_API.Services
{
    public interface IOperationalEventService
    {
        Task PublishAsync(
            OperationalEvent evt,
            CancellationToken cancellationToken = default);

        Task PublishAsync(
            string eventType,
            string category,
            string severity,
            string source,
            string entityType,
            string? entityId,
            string action,
            string message,
            Dictionary<string, object?>? data = null,
            CancellationToken cancellationToken = default);

        Task<List<OperationalEvent>> GetHistoryAsync(int count = 100);
    }

    public class OperationalEventService : IOperationalEventService
    {
        private readonly IConnectionMultiplexer _redis;
        private readonly ILogger<OperationalEventService> _logger;
        private const int MaxHistoryEvents = 5000;
        private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
        {
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
        };

        public OperationalEventService(
            IConnectionMultiplexer redis,
            ILogger<OperationalEventService> logger)
        {
            _redis = redis;
            _logger = logger;
        }

        public Task PublishAsync(
            string eventType,
            string category,
            string severity,
            string source,
            string entityType,
            string? entityId,
            string action,
            string message,
            Dictionary<string, object?>? data = null,
            CancellationToken cancellationToken = default)
        {
            var evt = new OperationalEvent
            {
                EventType = eventType,
                Category = category.ToUpperInvariant(),
                Severity = severity.ToUpperInvariant(),
                Source = source,
                EntityType = entityType,
                EntityId = entityId,
                Action = action,
                Message = message,
                Data = data ?? new Dictionary<string, object?>()
            };

            return PublishAsync(evt, cancellationToken);
        }

        public async Task PublishAsync(
            OperationalEvent evt,
            CancellationToken cancellationToken = default)
        {
            try
            {
                cancellationToken.ThrowIfCancellationRequested();

                evt.EventId = string.IsNullOrWhiteSpace(evt.EventId) ? Guid.NewGuid().ToString("N") : evt.EventId;
                evt.TimestampUtc = evt.TimestampUtc == default ? DateTime.UtcNow : evt.TimestampUtc;
                evt.Category = string.IsNullOrWhiteSpace(evt.Category) ? "SYSTEM" : evt.Category.ToUpperInvariant();
                evt.Severity = string.IsNullOrWhiteSpace(evt.Severity) ? "INFO" : evt.Severity.ToUpperInvariant();
                evt.Source = string.IsNullOrWhiteSpace(evt.Source) ? "AEGIS_API" : evt.Source;
                evt.EntityType = string.IsNullOrWhiteSpace(evt.EntityType) ? "system" : evt.EntityType;
                evt.Action = string.IsNullOrWhiteSpace(evt.Action) ? "unknown" : evt.Action;
                evt.Message ??= string.Empty;
                evt.Data ??= new Dictionary<string, object?>();

                var payload = JsonSerializer.Serialize(evt, JsonOptions);
                var db = _redis.GetDatabase();

                await db.PublishAsync(
                    new RedisChannel(OperationalEventChannels.PubSubChannel, RedisChannel.PatternMode.Literal),
                    payload).ConfigureAwait(false);

                var streamEntry = new[]
                {
                    new NameValueEntry("event", payload),
                    new NameValueEntry("event_type", evt.EventType),
                    new NameValueEntry("category", evt.Category),
                    new NameValueEntry("severity", evt.Severity),
                    new NameValueEntry("source", evt.Source),
                    new NameValueEntry("entity_type", evt.EntityType),
                    new NameValueEntry("entity_id", evt.EntityId ?? string.Empty),
                    new NameValueEntry("action", evt.Action)
                };

                await db.StreamAddAsync(
                    OperationalEventChannels.HistoryStream,
                    streamEntry,
                    maxLength: MaxHistoryEvents,
                    useApproximateMaxLength: true).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                // Ignore cancellation to avoid masking graceful shutdown.
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Operational event publish failed: {EventType}", evt.EventType);
            }
        }

        public async Task<List<OperationalEvent>> GetHistoryAsync(int count = 100)
        {
            try
            {
                var db = _redis.GetDatabase();
                var entries = await db.StreamRangeAsync(
                    OperationalEventChannels.HistoryStream,
                    minId: "+",
                    maxId: "-",
                    count: count,
                    messageOrder: Order.Descending
                ).ConfigureAwait(false);

                var result = new List<OperationalEvent>();
                foreach (var entry in entries)
                {
                    var eventPayload = entry.Values.FirstOrDefault(v => v.Name == "event");
                    if (eventPayload.Value.HasValue)
                    {
                        var evt = JsonSerializer.Deserialize<OperationalEvent>(eventPayload.Value.ToString(), JsonOptions);
                        if (evt != null)
                        {
                            result.Add(evt);
                        }
                    }
                }
                
                // Reverse to return in chronological order (oldest first among the latest batch)
                result.Reverse();
                return result;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to retrieve history events from Redis stream.");
                return new List<OperationalEvent>();
            }
        }
    }
}
