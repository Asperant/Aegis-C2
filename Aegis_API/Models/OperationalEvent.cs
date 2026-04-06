using System.Text.Json.Serialization;

namespace Aegis_API.Models
{
    public static class OperationalEventChannels
    {
        public const string PubSubChannel = "ops_event_stream";
        public const string HistoryStream = "ops_event_history";
    }

    public class OperationalEvent
    {
        [JsonPropertyName("eventId")]
        public string EventId { get; set; } = Guid.NewGuid().ToString("N");

        [JsonPropertyName("timestampUtc")]
        public DateTime TimestampUtc { get; set; } = DateTime.UtcNow;

        [JsonPropertyName("eventType")]
        public string EventType { get; set; } = "system.event";

        [JsonPropertyName("category")]
        public string Category { get; set; } = "SYSTEM";

        [JsonPropertyName("severity")]
        public string Severity { get; set; } = "INFO";

        [JsonPropertyName("source")]
        public string Source { get; set; } = "AEGIS_API";

        [JsonPropertyName("entityType")]
        public string EntityType { get; set; } = "system";

        [JsonPropertyName("entityId")]
        public string? EntityId { get; set; }

        [JsonPropertyName("action")]
        public string Action { get; set; } = "unknown";

        [JsonPropertyName("message")]
        public string Message { get; set; } = string.Empty;

        [JsonPropertyName("data")]
        public Dictionary<string, object?> Data { get; set; } = new();
    }
}
