using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using FluentValidation;
using Aegis_API.Commands;
using Aegis_API.Services;

namespace Aegis_API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize(Roles = "Commander")]
    public class TacticalController : ControllerBase
    {
        private readonly IMediator _mediator;
        private readonly ILogger<TacticalController> _logger;
        private readonly IValidator<SendTacticalCommandRequest> _tacticalValidator;
        private readonly IValidator<SendMissionCommandRequest> _missionValidator;
        private readonly IOperationalEventService _eventService;

        public TacticalController(
            IMediator mediator,
            ILogger<TacticalController> logger,
            IValidator<SendTacticalCommandRequest> tacticalValidator,
            IValidator<SendMissionCommandRequest> missionValidator,
            IOperationalEventService eventService)
        {
            _mediator = mediator;
            _logger = logger;
            _tacticalValidator = tacticalValidator;
            _missionValidator = missionValidator;
            _eventService = eventService;
        }

        [HttpPost("command")]
        public async Task<IActionResult> SendCommand([FromBody] SendTacticalCommandRequest request)
        {
            var validation = await _tacticalValidator.ValidateAsync(request);
            if (!validation.IsValid)
            {
                await _eventService.PublishAsync(
                    eventType: "tactical.command.invalid",
                    category: "COMMAND",
                    severity: "WARN",
                    source: "AEGIS_API",
                    entityType: "uav",
                    entityId: request.UavId,
                    action: request.CommandType,
                    message: $"{request.UavId} için taktik komut validasyon hatası.",
                    data: new Dictionary<string, object?>
                    {
                        ["errors"] = validation.Errors.Select(e => e.ErrorMessage).ToArray()
                    });
                return BadRequest(new { Errors = validation.Errors.Select(e => e.ErrorMessage) });
            }

            _logger.LogInformation("REST Request: Sending Tactical Command to {UavId}", request.UavId);
            var success = await _mediator.Send(request);
            if (success)
            {
                await _eventService.PublishAsync(
                    eventType: "tactical.command.accepted",
                    category: "COMMAND",
                    severity: "INFO",
                    source: "AEGIS_API",
                    entityType: "uav",
                    entityId: request.UavId,
                    action: request.CommandType,
                    message: $"{request.UavId} için {request.CommandType} komutu REST üzerinden kabul edildi.",
                    data: new Dictionary<string, object?>
                    {
                        ["uavId"] = request.UavId,
                        ["commandType"] = request.CommandType,
                        ["lat"] = request.Lat,
                        ["lng"] = request.Lng,
                        ["targetIp"] = request.TargetIp
                    });
                return Ok(new { message = "Command dispatched successfully via Redis." });
            }

            await _eventService.PublishAsync(
                eventType: "tactical.command.failed",
                category: "COMMAND",
                severity: "ERROR",
                source: "AEGIS_API",
                entityType: "uav",
                entityId: request.UavId,
                action: request.CommandType,
                message: $"{request.UavId} için {request.CommandType} komutu yayınlanamadı.",
                data: new Dictionary<string, object?>
                {
                    ["uavId"] = request.UavId,
                    ["commandType"] = request.CommandType
                });

            return StatusCode(500, new { message = "Failed to dispatch command." });
        }

        [HttpPost("mission")]
        public async Task<IActionResult> DispatchMission([FromBody] SendMissionCommandRequest request)
        {
            var validation = await _missionValidator.ValidateAsync(request);
            if (!validation.IsValid)
            {
                await _eventService.PublishAsync(
                    eventType: "mission.upload.invalid",
                    category: "MISSION",
                    severity: "WARN",
                    source: "AEGIS_API",
                    entityType: "uav",
                    entityId: request.UavId,
                    action: "MISSION_UPLOAD",
                    message: $"{request.UavId} görev yükleme validasyon hatası.",
                    data: new Dictionary<string, object?>
                    {
                        ["errors"] = validation.Errors.Select(e => e.ErrorMessage).ToArray()
                    });
                return BadRequest(new { Errors = validation.Errors.Select(e => e.ErrorMessage) });
            }

            _logger.LogInformation("REST Request: Dispatching Mission to {UavId} with {WpCount} waypoints.", request.UavId, request.Waypoints?.Count ?? 0);
            var success = await _mediator.Send(request);
            if (success)
            {
                await _eventService.PublishAsync(
                    eventType: "mission.upload.accepted",
                    category: "MISSION",
                    severity: "INFO",
                    source: "AEGIS_API",
                    entityType: "uav",
                    entityId: request.UavId,
                    action: "MISSION_UPLOAD",
                    message: $"{request.UavId} için görev ({request.Waypoints?.Count ?? 0} waypoint) kabul edildi.",
                    data: new Dictionary<string, object?>
                    {
                        ["uavId"] = request.UavId,
                        ["waypointCount"] = request.Waypoints?.Count ?? 0
                    });
                return Ok(new { message = "Mission Waypoints dispatched successfully via Redis." });
            }

            await _eventService.PublishAsync(
                eventType: "mission.upload.failed",
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
                    ["waypointCount"] = request.Waypoints?.Count ?? 0
                });

            return StatusCode(500, new { message = "Failed to dispatch mission." });
        }
    }
}
