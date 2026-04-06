using MediatR;
using StackExchange.Redis;
using System.Text.Json;
using Aegis_API.Services;

using System.Text.Json.Serialization;

namespace Aegis_API.Commands
{
    public class Waypoint
    {
        [JsonPropertyName("lat")]
        public double Lat { get; set; }

        [JsonPropertyName("lng")]
        public double Lng { get; set; }
    }

    public class SendMissionCommandRequest : IRequest<bool>
    {
        public string UavId { get; set; } = string.Empty;
        public List<Waypoint> Waypoints { get; set; } = new();
    }

    public class SendMissionCommandHandler : IRequestHandler<SendMissionCommandRequest, bool>
    {
        private readonly IConnectionMultiplexer _redis;
        private readonly ILogger<SendMissionCommandHandler> _logger;
        private readonly IOperationalEventService _eventService;

        public SendMissionCommandHandler(
            IConnectionMultiplexer redis,
            ILogger<SendMissionCommandHandler> logger,
            IOperationalEventService eventService)
        {
            _redis = redis;
            _logger = logger;
            _eventService = eventService;
        }

        public async Task<bool> Handle(SendMissionCommandRequest request, CancellationToken cancellationToken)
        {
            try
            {
                if (request.Waypoints == null || !request.Waypoints.Any())
                {
                    _logger.LogWarning("Mission upload rejected because waypoint list is empty. UavId={UavId}", request.UavId);
                    await _eventService.PublishAsync(
                        eventType: "mission.upload.invalid",
                        category: "MISSION",
                        severity: "WARN",
                        source: "AEGIS_API",
                        entityType: "uav",
                        entityId: request.UavId,
                        action: "MISSION_UPLOAD",
                        message: $"{request.UavId} için görev yükleme reddedildi: waypoint yok.",
                        data: new Dictionary<string, object?>
                        {
                            ["uavId"] = request.UavId,
                            ["waypointCount"] = 0
                        },
                        cancellationToken);
                    return false;
                }

                _logger.LogInformation(
                    "Dispatching mission upload. UavId={UavId}, WaypointCount={WaypointCount}",
                    request.UavId, request.Waypoints.Count);

                var commandPayload = JsonSerializer.Serialize(new {
                    target = request.UavId,
                    command = "MISSION_UPLOAD",
                    waypoints = request.Waypoints,
                    timestamp = DateTime.UtcNow
                });

                var db = _redis.GetDatabase();
                var channel = new RedisChannel("command_stream", RedisChannel.PatternMode.Literal);
                
                await db.PublishAsync(channel, commandPayload);

                await _eventService.PublishAsync(
                    eventType: "mission.upload.published",
                    category: "MISSION",
                    severity: "INFO",
                    source: "AEGIS_API",
                    entityType: "uav",
                    entityId: request.UavId,
                    action: "MISSION_UPLOAD",
                    message: $"{request.UavId} için görev ({request.Waypoints.Count} waypoint) Redis'e yayınlandı.",
                    data: new Dictionary<string, object?>
                    {
                        ["uavId"] = request.UavId,
                        ["waypointCount"] = request.Waypoints.Count,
                        ["channel"] = "command_stream"
                    },
                    cancellationToken);
                
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Mission command processing failed for UavId={UavId}", request.UavId);
                await _eventService.PublishAsync(
                    eventType: "mission.upload.publish_failed",
                    category: "MISSION",
                    severity: "ERROR",
                    source: "AEGIS_API",
                    entityType: "uav",
                    entityId: request.UavId,
                    action: "MISSION_UPLOAD",
                    message: $"{request.UavId} için görev yayınlanamadı.",
                    data: new Dictionary<string, object?>
                    {
                        ["uavId"] = request.UavId,
                        ["waypointCount"] = request.Waypoints?.Count ?? 0,
                        ["error"] = ex.Message
                    },
                    cancellationToken);
                return false;
            }
        }
    }
}
