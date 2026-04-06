using MediatR;
using StackExchange.Redis;
using System.Text.Json;
using Aegis_API.Services;

namespace Aegis_API.Commands
{
    public enum TacticalCommandType
    {
        RTL,
        AUTO_PATROL,
        STOP,
        TAKEOFF,
        SPEED_INC,
        SPEED_DEC,
        ALT_INC,
        ALT_DEC,
        ORBIT_TARGET,
        FIGURE_8,
        EVASIVE_MANEUVER,
        HANDOVER
    }

    public class SendTacticalCommandRequest : IRequest<bool>
    {
        public string UavId { get; set; } = string.Empty;
        public string CommandType { get; set; } = string.Empty;
        public double? Lat { get; set; }
        public double? Lng { get; set; }
        // Required only for HANDOVER command.
        public string? TargetIp { get; set; }
    }

    public class SendTacticalCommandHandler : IRequestHandler<SendTacticalCommandRequest, bool>
    {
        private readonly IConnectionMultiplexer _redis;
        private readonly ILogger<SendTacticalCommandHandler> _logger;
        private readonly IOperationalEventService _eventService;

        public SendTacticalCommandHandler(
            IConnectionMultiplexer redis,
            ILogger<SendTacticalCommandHandler> logger,
            IOperationalEventService eventService)
        {
            _redis = redis;
            _logger = logger;
            _eventService = eventService;
        }

        public async Task<bool> Handle(SendTacticalCommandRequest request, CancellationToken cancellationToken)
        {
            try
            {
                if (!Enum.TryParse<TacticalCommandType>(request.CommandType, true, out var commandEnum))
                {
                    _logger.LogWarning("Invalid tactical command type received: {CommandType}", request.CommandType);
                    await _eventService.PublishAsync(
                        eventType: "command.tactical.invalid",
                        category: "COMMAND",
                        severity: "WARN",
                        source: "AEGIS_API",
                        entityType: "uav",
                        entityId: request.UavId,
                        action: request.CommandType,
                        message: $"{request.UavId} için geçersiz taktik komut denemesi.",
                        data: new Dictionary<string, object?>
                        {
                            ["uavId"] = request.UavId,
                            ["commandType"] = request.CommandType
                        },
                        cancellationToken);
                    return false;
                }

                _logger.LogInformation(
                    "Dispatching tactical command. UavId={UavId}, Command={Command}, Lat={Lat}, Lng={Lng}",
                    request.UavId, commandEnum, request.Lat, request.Lng);

                var commandData = new Dictionary<string, object>
                {
                    { "target", request.UavId },
                    { "command", commandEnum.ToString() },
                    { "timestamp", DateTime.UtcNow }
                };

                if (request.Lat.HasValue) commandData["lat"] = request.Lat.Value;
                if (request.Lng.HasValue) commandData["lng"] = request.Lng.Value;
                if (!string.IsNullOrEmpty(request.TargetIp)) commandData["target_ip"] = request.TargetIp;

                var commandPayload = JsonSerializer.Serialize(commandData);

                var db = _redis.GetDatabase();
                var channel = new RedisChannel("command_stream", RedisChannel.PatternMode.Literal);
                
                await db.PublishAsync(channel, commandPayload);

                await _eventService.PublishAsync(
                    eventType: "command.tactical.published",
                    category: commandEnum == TacticalCommandType.HANDOVER ? "HANDOVER" : "COMMAND",
                    severity: "INFO",
                    source: "AEGIS_API",
                    entityType: "uav",
                    entityId: request.UavId,
                    action: commandEnum.ToString(),
                    message: $"{request.UavId} için {commandEnum} komutu Redis'e yayınlandı.",
                    data: new Dictionary<string, object?>
                    {
                        ["uavId"] = request.UavId,
                        ["commandType"] = commandEnum.ToString(),
                        ["lat"] = request.Lat,
                        ["lng"] = request.Lng,
                        ["targetIp"] = request.TargetIp,
                        ["channel"] = "command_stream"
                    },
                    cancellationToken);
                
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Tactical command processing failed for UavId={UavId}", request.UavId);

                await _eventService.PublishAsync(
                    eventType: "command.tactical.publish_failed",
                    category: "COMMAND",
                    severity: "ERROR",
                    source: "AEGIS_API",
                    entityType: "uav",
                    entityId: request.UavId,
                    action: request.CommandType,
                    message: $"{request.UavId} için taktik komut yayınlanamadı.",
                    data: new Dictionary<string, object?>
                    {
                        ["uavId"] = request.UavId,
                        ["commandType"] = request.CommandType,
                        ["error"] = ex.Message
                    },
                    cancellationToken);
                return false;
            }
        }
    }
}
