using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.Authorization;
using MediatR;
using Aegis_API.Commands;
using Aegis_API.Services;

namespace Aegis_API.Hubs
{
    [Authorize]
    public class TelemetryHub : Hub
    {
        private readonly IMediator _mediator;
        private readonly ILogger<TelemetryHub> _logger;
        private readonly IOperationalEventService _eventService;

        public TelemetryHub(
            IMediator mediator,
            ILogger<TelemetryHub> logger,
            IOperationalEventService eventService)
        {
            _mediator = mediator;
            _logger = logger;
            _eventService = eventService;
        }

        public override async Task OnConnectedAsync()
        {
            _logger.LogInformation("Operator session connected. ConnectionId={ConnectionId}", Context.ConnectionId);

            await _eventService.PublishAsync(
                eventType: "signalr.connection.opened",
                category: "SYSTEM",
                severity: "INFO",
                source: "AEGIS_API",
                entityType: "operator_session",
                entityId: Context.ConnectionId,
                action: "connected",
                message: $"Yeni C2 operatör oturumu bağlandı ({Context.ConnectionId}).",
                data: new Dictionary<string, object?>
                {
                    ["connectionId"] = Context.ConnectionId
                });

            await base.OnConnectedAsync();
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            _logger.LogInformation("Operator session disconnected. ConnectionId={ConnectionId}", Context.ConnectionId);

            await _eventService.PublishAsync(
                eventType: "signalr.connection.closed",
                category: "SYSTEM",
                severity: exception is null ? "INFO" : "WARN",
                source: "AEGIS_API",
                entityType: "operator_session",
                entityId: Context.ConnectionId,
                action: "disconnected",
                message: exception is null
                    ? $"C2 operatör oturumu kapandı ({Context.ConnectionId})."
                    : $"C2 operatör oturumu hata ile koptu ({Context.ConnectionId}).",
                data: new Dictionary<string, object?>
                {
                    ["connectionId"] = Context.ConnectionId,
                    ["error"] = exception?.Message
                });

            await base.OnDisconnectedAsync(exception);
        }

        public async Task SendTacticalCommand(string uavId, string commandType, double? lat = null, double? lng = null)
        {
            try
            {
                await _eventService.PublishAsync(
                    eventType: "tactical.command.requested",
                    category: "COMMAND",
                    severity: "INFO",
                    source: "AEGIS_API",
                    entityType: "uav",
                    entityId: uavId,
                    action: commandType,
                    message: $"{uavId} için {commandType} komutu SignalR üzerinden istendi.",
                    data: new Dictionary<string, object?>
                    {
                        ["uavId"] = uavId,
                        ["commandType"] = commandType,
                        ["lat"] = lat,
                        ["lng"] = lng,
                        ["connectionId"] = Context.ConnectionId
                    });

                var success = await _mediator.Send(new SendTacticalCommandRequest { UavId = uavId, CommandType = commandType, Lat = lat, Lng = lng });
                
                if (success)
                {
                    await Clients.Caller.SendAsync("CommandDispatched", uavId, commandType);

                    await _eventService.PublishAsync(
                        eventType: "tactical.command.dispatched",
                        category: "COMMAND",
                        severity: "INFO",
                        source: "AEGIS_API",
                        entityType: "uav",
                        entityId: uavId,
                        action: commandType,
                        message: $"{uavId} için {commandType} komutu yayınlandı.",
                        data: new Dictionary<string, object?>
                        {
                            ["uavId"] = uavId,
                            ["commandType"] = commandType
                        });
                }
                else 
                {
                    await Clients.Caller.SendAsync("SystemAlert", $"Komut İletilemedi: {commandType} - Geçersiz Komut Tipi");

                    await _eventService.PublishAsync(
                        eventType: "tactical.command.rejected",
                        category: "COMMAND",
                        severity: "WARN",
                        source: "AEGIS_API",
                        entityType: "uav",
                        entityId: uavId,
                        action: commandType,
                        message: $"{uavId} için {commandType} komutu reddedildi.",
                        data: new Dictionary<string, object?>
                        {
                            ["uavId"] = uavId,
                            ["commandType"] = commandType
                        });
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "SendTacticalCommand başarısız oldu. UavId={UavId}, Command={Command}", uavId, commandType);

                await _eventService.PublishAsync(
                    eventType: "tactical.command.error",
                    category: "COMMAND",
                    severity: "ERROR",
                    source: "AEGIS_API",
                    entityType: "uav",
                    entityId: uavId,
                    action: commandType,
                    message: $"{uavId} için {commandType} komutunda sunucu hatası oluştu.",
                    data: new Dictionary<string, object?>
                    {
                        ["uavId"] = uavId,
                        ["commandType"] = commandType,
                        ["error"] = ex.Message
                    });

                await Clients.Caller.SendAsync("SystemAlert", $"Komut işlenirken sunucu hatası oluştu: {commandType}");
            }
        }
    }
}
