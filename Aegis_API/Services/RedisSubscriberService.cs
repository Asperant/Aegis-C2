using Microsoft.AspNetCore.SignalR;
using StackExchange.Redis;
using Aegis_API.Hubs;
using Aegis_API.Models;

namespace Aegis_API.Services
{
    public class RedisSubscriberService : BackgroundService
    {
        private readonly IConnectionMultiplexer _redis;
        private readonly IHubContext<TelemetryHub> _hubContext;
        private readonly ILogger<RedisSubscriberService> _logger;
        private ISubscriber? _subscriber;
        private static readonly RedisChannel TelemetryChannel = new("telemetry_stream", RedisChannel.PatternMode.Literal);
        private static readonly RedisChannel OpsEventChannel = new(OperationalEventChannels.PubSubChannel, RedisChannel.PatternMode.Literal);

        public RedisSubscriberService(IConnectionMultiplexer redis, IHubContext<TelemetryHub> hubContext, ILogger<RedisSubscriberService> logger)
        {
            _redis = redis;
            _hubContext = hubContext;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _subscriber = _redis.GetSubscriber();
            await SubscribeChannelsAsync();

            _logger.LogInformation("Subscribed to telemetry channel: {TelemetryChannel}", TelemetryChannel);
            _logger.LogInformation("Subscribed to operational events channel: {OpsChannel}", OpsEventChannel);

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await BroadcastGksLocationsAsync(stoppingToken);
                    await Task.Delay(2000, stoppingToken);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Redis publish loop failed. Retrying.");
                    await _hubContext.Clients.All.SendAsync("SystemAlert", "GKS connection interrupted", stoppingToken);
                    await Task.Delay(5000, stoppingToken);
                }
            }
        }

        public override async Task StopAsync(CancellationToken cancellationToken)
        {
            if (_subscriber is not null)
            {
                try
                {
                    await _subscriber.UnsubscribeAsync(TelemetryChannel);
                    await _subscriber.UnsubscribeAsync(OpsEventChannel);
                }
                catch (Exception ex)
                {
                    _logger.LogDebug(ex, "Redis kanalları unsubscribe edilirken hata oluştu.");
                }
            }

            await base.StopAsync(cancellationToken);
        }

        private async Task SubscribeChannelsAsync()
        {
            if (_subscriber is null)
            {
                return;
            }

            await _subscriber.SubscribeAsync(TelemetryChannel, (channel, message) =>
            {
                _ = _hubContext.Clients.All.SendAsync("ReceiveTelemetry", message.ToString());
            });

            await _subscriber.SubscribeAsync(OpsEventChannel, (channel, message) =>
            {
                _ = _hubContext.Clients.All.SendAsync("ReceiveOpsEvent", message.ToString());
            });
        }

        private async Task BroadcastGksLocationsAsync(CancellationToken stoppingToken)
        {
            var db = _redis.GetDatabase();
            var keys = RedisKeyScanner.ScanKeys(_redis, db.Database, "gks_instance:*");

            var gksList = new List<string>(capacity: keys.Count);
            foreach (var key in keys)
            {
                var keyText = key.ToString();
                var gksNumericId = keyText.Replace("gks_instance:", "", StringComparison.Ordinal);

                // Prevent reappearing entries when terminating pods emit a final heartbeat.
                var deletingMarker = await db.KeyExistsAsync($"gks_deleting:{gksNumericId}");
                if (deletingMarker)
                {
                    continue;
                }

                var gksData = await db.StringGetAsync(key);
                if (gksData.HasValue)
                {
                    gksList.Add(gksData.ToString());
                }
            }

            // Always broadcast the full list so UI can clear stale markers.
            var jsonList = "[" + string.Join(",", gksList) + "]";
            await _hubContext.Clients.All.SendAsync("ReceiveGksLocations", jsonList, stoppingToken);
        }
    }
}
