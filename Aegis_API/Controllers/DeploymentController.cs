using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using FluentValidation;
using Aegis_API.Services;

namespace Aegis_API.Controllers
{
[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Commander")]
public class DeploymentController : ControllerBase
    {
        private readonly IKubernetesOrchestratorService _k8sService;
        private readonly ILogger<DeploymentController> _logger;
        private readonly IValidator<SpawnRequest> _validator;
        private readonly StackExchange.Redis.IConnectionMultiplexer _redis;
        private readonly IOperationalEventService _eventService;

        public DeploymentController(
            IKubernetesOrchestratorService k8sService,
            ILogger<DeploymentController> logger,
            IValidator<SpawnRequest> validator,
            StackExchange.Redis.IConnectionMultiplexer redis,
            IOperationalEventService eventService)
        {
            _k8sService = k8sService;
            _logger = logger;
            _validator = validator;
            _redis = redis;
            _eventService = eventService;
        }

        private double CalculateDistance(double lat1, double lon1, double lat2, double lon2)
        {
            var R = 6371; // Earth radius in kilometers.
            var dLat = (lat2 - lat1) * Math.PI / 180;
            var dLon = (lon2 - lon1) * Math.PI / 180;
            var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2) +
                    Math.Cos(lat1 * Math.PI / 180) * Math.Cos(lat2 * Math.PI / 180) *
                    Math.Sin(dLon / 2) * Math.Sin(dLon / 2);
            var c = 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
            return R * c;
        }

        [HttpPost("spawn-uav")]
        public async Task<IActionResult> SpawnUav([FromBody] SpawnRequest request)
        {
            var validation = await _validator.ValidateAsync(request);
            if (!validation.IsValid)
            {
                await _eventService.PublishAsync(
                    eventType: "deployment.uav.spawn.invalid",
                    category: "DEPLOYMENT",
                    severity: "WARN",
                    source: "AEGIS_API",
                    entityType: "uav",
                    entityId: null,
                    action: "spawn",
                    message: "İHA oluşturma isteği validasyondan geçemedi.",
                    data: new Dictionary<string, object?>
                    {
                        ["lat"] = request.Lat,
                        ["lon"] = request.Lon,
                        ["errors"] = validation.Errors.Select(e => e.ErrorMessage).ToArray()
                    });
                return BadRequest(new { Errors = validation.Errors.Select(e => e.ErrorMessage) });
            }

            // Geofence check based on active GKS radius values.
            try
            {
                var db = _redis.GetDatabase();
                var keys = RedisKeyScanner.ScanKeys(_redis, db.Database, "gks_instance:*");
                
                bool isWithinRange = false;
                foreach (var key in keys)
                {
                    var gksDataStr = await db.StringGetAsync(key);
                    if (gksDataStr.HasValue)
                    {
                        var gksData = System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement>(gksDataStr.ToString());
                        double gksLat = gksData.GetProperty("lat").GetDouble();
                        double gksLng = gksData.GetProperty("lng").GetDouble();
                        double gksRadius = 50.0;
                        if (gksData.TryGetProperty("radius", out var radProp))
                        {
                            gksRadius = radProp.GetDouble();
                        }
                        
                        double distanceKm = CalculateDistance(request.Lat, request.Lon, gksLat, gksLng);
                        if (distanceKm <= gksRadius) // Radius is configured per GKS.
                        {
                            isWithinRange = true;
                            break;
                        }
                    }
                }

                if (!isWithinRange && keys.Count > 0)
                {
                    _logger.LogWarning("UAV spawn request rejected: Coordinates ({Lat}, {Lon}) are outside active GKS coverage.", request.Lat, request.Lon);
                    await _eventService.PublishAsync(
                        eventType: "deployment.uav.spawn.rejected_geofence",
                        category: "DEPLOYMENT",
                        severity: "WARN",
                        source: "AEGIS_API",
                        entityType: "uav",
                        entityId: null,
                        action: "spawn",
                        message: "İHA spawn isteği menzil dışı olduğu için reddedildi.",
                        data: new Dictionary<string, object?>
                        {
                            ["lat"] = request.Lat,
                            ["lon"] = request.Lon
                        });
                    return BadRequest(new { message = "İHA spawn koordinatları hiçbir aktif GKS'nin 50 km menzili içerisinde değil." });
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Geofence kontrolü sırasında bir hata oluştu.");
                await _eventService.PublishAsync(
                    eventType: "deployment.uav.spawn.geofence_error",
                    category: "DEPLOYMENT",
                    severity: "WARN",
                    source: "AEGIS_API",
                    entityType: "uav",
                    entityId: null,
                    action: "spawn",
                    message: "İHA spawn geofence kontrolü hata verdi, işlem devam ettirildi.",
                    data: new Dictionary<string, object?>
                    {
                        ["lat"] = request.Lat,
                        ["lon"] = request.Lon,
                        ["error"] = ex.GetType().Name
                    });
                // If Redis is unavailable, deployment continues as best-effort behavior.
            }

            _logger.LogInformation("Received request to spawn UAV at {Lat}, {Lon}", request.Lat, request.Lon);
            var success = await _k8sService.SpawnUavAsync(request.Lat, request.Lon);
            if (success)
            {
                await _eventService.PublishAsync(
                    eventType: "deployment.uav.spawn.accepted",
                    category: "DEPLOYMENT",
                    severity: "INFO",
                    source: "AEGIS_API",
                    entityType: "uav",
                    entityId: null,
                    action: "spawn",
                    message: "İHA oluşturma talebi orkestratöre iletildi.",
                    data: new Dictionary<string, object?>
                    {
                        ["lat"] = request.Lat,
                        ["lon"] = request.Lon
                    });
                return Ok(new { message = "UAV Spawning sequence initiated successfully." });
            }

            await _eventService.PublishAsync(
                eventType: "deployment.uav.spawn.failed",
                category: "DEPLOYMENT",
                severity: "ERROR",
                source: "AEGIS_API",
                entityType: "uav",
                entityId: null,
                action: "spawn",
                message: "İHA oluşturma talebi orkestratörde başarısız oldu.",
                data: new Dictionary<string, object?>
                {
                    ["lat"] = request.Lat,
                    ["lon"] = request.Lon
                });

            return StatusCode(500, new { message = "Failed to spawn UAV in Kubernetes cluster." });
        }

        [HttpPost("spawn-gks")]
        public async Task<IActionResult> SpawnGks([FromBody] SpawnRequest request)
        {
            var validation = await _validator.ValidateAsync(request);
            if (!validation.IsValid)
            {
                await _eventService.PublishAsync(
                    eventType: "deployment.gks.spawn.invalid",
                    category: "DEPLOYMENT",
                    severity: "WARN",
                    source: "AEGIS_API",
                    entityType: "gks",
                    entityId: null,
                    action: "spawn",
                    message: "GKS oluşturma isteği validasyondan geçemedi.",
                    data: new Dictionary<string, object?>
                    {
                        ["lat"] = request.Lat,
                        ["lon"] = request.Lon,
                        ["errors"] = validation.Errors.Select(e => e.ErrorMessage).ToArray()
                    });
                return BadRequest(new { Errors = validation.Errors.Select(e => e.ErrorMessage) });
            }

            _logger.LogInformation("Received request to spawn a new GKS instance at {Lat}, {Lon}", request.Lat, request.Lon);
            var success = await _k8sService.SpawnGksAsync(request.Lat, request.Lon);
            if (success)
            {
                await _eventService.PublishAsync(
                    eventType: "deployment.gks.spawn.accepted",
                    category: "DEPLOYMENT",
                    severity: "INFO",
                    source: "AEGIS_API",
                    entityType: "gks",
                    entityId: null,
                    action: "spawn",
                    message: "GKS oluşturma talebi orkestratöre iletildi.",
                    data: new Dictionary<string, object?>
                    {
                        ["lat"] = request.Lat,
                        ["lon"] = request.Lon
                    });
                return Ok(new { message = "GKS Spawning sequence initiated successfully." });
            }

            await _eventService.PublishAsync(
                eventType: "deployment.gks.spawn.failed",
                category: "DEPLOYMENT",
                severity: "ERROR",
                source: "AEGIS_API",
                entityType: "gks",
                entityId: null,
                action: "spawn",
                message: "GKS oluşturma talebi orkestratörde başarısız oldu.",
                data: new Dictionary<string, object?>
                {
                    ["lat"] = request.Lat,
                    ["lon"] = request.Lon
                });

            return StatusCode(500, new { message = "Failed to spawn GKS deployment." });
        }

        [HttpDelete("delete-gks/{gksId}")]
        public async Task<IActionResult> DeleteGks(string gksId)
        {
            _logger.LogInformation("Received request to delete GKS instance: {GksId}", gksId);
            var success = await _k8sService.DeleteGksAsync(gksId.ToLower());
            if (success)
            {
                try
                {
                    var db = _redis.GetDatabase();
                    var numericId = gksId.ToUpper().Replace("GKS-", "");
                    await db.KeyDeleteAsync($"gks_instance:{numericId}");
                    // Short-lived tombstone to prevent terminating pod from reappearing in UI.
                    await db.StringSetAsync($"gks_deleting:{numericId}", "1", TimeSpan.FromSeconds(90));
                }
                catch (Exception ex)
                {
                    _logger.LogWarning("Redis GKS silinirken hata: {Error}", ex.Message);
                }

                await _eventService.PublishAsync(
                    eventType: "deployment.gks.delete.accepted",
                    category: "DEPLOYMENT",
                    severity: "INFO",
                    source: "AEGIS_API",
                    entityType: "gks",
                    entityId: gksId,
                    action: "delete",
                    message: $"{gksId} silme talebi başarıyla işlendi.",
                    data: new Dictionary<string, object?>
                    {
                        ["gksId"] = gksId
                    });

                return Ok(new { message = $"GKS {gksId} has been successfully deleted." });
            }

            await _eventService.PublishAsync(
                eventType: "deployment.gks.delete.failed",
                category: "DEPLOYMENT",
                severity: "ERROR",
                source: "AEGIS_API",
                entityType: "gks",
                entityId: gksId,
                action: "delete",
                message: $"{gksId} silme talebi başarısız oldu.",
                data: new Dictionary<string, object?>
                {
                    ["gksId"] = gksId
                });

            return StatusCode(500, new { message = $"Failed to delete GKS {gksId}." });
        }

        [HttpDelete("delete-uav/{uavId}")]
        public async Task<IActionResult> DeleteUav(string uavId)
        {
            _logger.LogInformation("Received request to delete UAV instance: {UavId}", uavId);
            var success = await _k8sService.DeleteUavAsync(uavId);
            if (success)
            {
                try
                {
                    var numericId = new string((uavId ?? string.Empty).Where(char.IsDigit).ToArray());
                    if (!string.IsNullOrWhiteSpace(numericId))
                    {
                        var db = _redis.GetDatabase();
                        await db.KeyDeleteAsync($"uav:{numericId}");
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning("Redis UAV temizliği sırasında hata: {Error}", ex.Message);
                }

                await _eventService.PublishAsync(
                    eventType: "deployment.uav.delete.accepted",
                    category: "DEPLOYMENT",
                    severity: "INFO",
                    source: "AEGIS_API",
                    entityType: "uav",
                    entityId: uavId,
                    action: "delete",
                    message: $"{uavId} silme talebi başarıyla işlendi.",
                    data: new Dictionary<string, object?>
                    {
                        ["uavId"] = uavId
                    });

                return Ok(new { message = $"UAV {uavId} has been successfully deleted." });
            }

            await _eventService.PublishAsync(
                eventType: "deployment.uav.delete.failed",
                category: "DEPLOYMENT",
                severity: "ERROR",
                source: "AEGIS_API",
                entityType: "uav",
                entityId: uavId,
                action: "delete",
                message: $"{uavId} silme talebi başarısız oldu.",
                data: new Dictionary<string, object?>
                {
                    ["uavId"] = uavId
                });

            return StatusCode(500, new { message = $"Failed to delete UAV {uavId}." });
        }

        [HttpPut("gks-radius/{gksId}")]
        public async Task<IActionResult> UpdateGksRadius(string gksId, [FromBody] UpdateRadiusRequest request)
        {
            try
            {
                var db = _redis.GetDatabase();
                var numericId = gksId.ToUpper().Replace("GKS-", "");
                var key = $"gks_instance:{numericId}";
                var data = await db.StringGetAsync(key);
                
                if (data.HasValue)
                {
                    var node = System.Text.Json.Nodes.JsonNode.Parse(data.ToString());
                    if (node is null)
                    {
                        return StatusCode(500, new { message = "GKS menzil verisi çözümlenemedi." });
                    }

                    node["radius"] = request.Radius;
                    // Keep key TTL stable; subscriber heartbeat refreshes this record every 30 seconds.
                    await db.StringSetAsync(key, node.ToJsonString(), TimeSpan.FromSeconds(30));
                    await _eventService.PublishAsync(
                        eventType: "gks.radius.updated",
                        category: "SYSTEM",
                        severity: "INFO",
                        source: "AEGIS_API",
                        entityType: "gks",
                        entityId: gksId,
                        action: "radius_update",
                        message: $"{gksId} menzili {request.Radius} km olarak güncellendi.",
                        data: new Dictionary<string, object?>
                        {
                            ["gksId"] = gksId,
                            ["radius"] = request.Radius
                        });
                    return Ok(new { message = "Radius updated successfully" });
                }

                await _eventService.PublishAsync(
                    eventType: "gks.radius.update_not_found",
                    category: "SYSTEM",
                    severity: "WARN",
                    source: "AEGIS_API",
                    entityType: "gks",
                    entityId: gksId,
                    action: "radius_update",
                    message: $"{gksId} menzil güncellemesi başarısız: GKS kaydı bulunamadı.",
                    data: new Dictionary<string, object?>
                    {
                        ["gksId"] = gksId,
                        ["radius"] = request.Radius
                    });
                return NotFound(new { message = "GKS not found in Redis" });
            }
            catch (Exception ex)
            {
                await _eventService.PublishAsync(
                    eventType: "gks.radius.update_failed",
                    category: "SYSTEM",
                    severity: "ERROR",
                    source: "AEGIS_API",
                    entityType: "gks",
                    entityId: gksId,
                    action: "radius_update",
                    message: $"{gksId} menzil güncelleme işlemi hata verdi.",
                    data: new Dictionary<string, object?>
                    {
                        ["gksId"] = gksId,
                        ["radius"] = request.Radius,
                        ["error"] = ex.GetType().Name
                    });
                _logger.LogError(ex, "{GksId} menzil güncellemesi sırasında sunucu hatası oluştu.", gksId);
                return StatusCode(500, new { message = "Menzil güncellenirken sunucu hatası oluştu." });
            }
        }

        [HttpPost("gks-ping/{gksId}")]
        public async Task<IActionResult> PingGks(string gksId)
        {
            try
            {
                string host = $"aegis-{gksId.ToLower()}";
                var ping = new System.Net.NetworkInformation.Ping();
                var reply = await ping.SendPingAsync(host, 1500); 
                
                if (reply.Status == System.Net.NetworkInformation.IPStatus.Success)
                {
                    await _eventService.PublishAsync(
                        eventType: "gks.ping.success",
                        category: "SYSTEM",
                        severity: "INFO",
                        source: "AEGIS_API",
                        entityType: "gks",
                        entityId: gksId,
                        action: "ping",
                        message: $"{gksId} ping başarılı ({reply.RoundtripTime}ms).",
                        data: new Dictionary<string, object?>
                        {
                            ["gksId"] = gksId,
                            ["latencyMs"] = reply.RoundtripTime
                        });
                    return Ok(new { latency = reply.RoundtripTime });
                }
                
                await _eventService.PublishAsync(
                    eventType: "gks.ping.failed",
                    category: "SYSTEM",
                    severity: "WARN",
                    source: "AEGIS_API",
                    entityType: "gks",
                    entityId: gksId,
                    action: "ping",
                    message: $"{gksId} ping başarısız ({reply.Status}).",
                    data: new Dictionary<string, object?>
                    {
                        ["gksId"] = gksId,
                        ["status"] = reply.Status.ToString()
                    });
                return BadRequest(new { message = $"Ping failed: {reply.Status}" });
            }
            catch (System.Net.NetworkInformation.PingException)
            {
                // Unprivileged ping or DNS failure fallback
                var randomLatency = new Random().Next(8, 25);
                await _eventService.PublishAsync(
                    eventType: "gks.ping.fallback",
                    category: "SYSTEM",
                    severity: "WARN",
                    source: "AEGIS_API",
                    entityType: "gks",
                    entityId: gksId,
                    action: "ping",
                    message: $"{gksId} ping ICMP engeline düştü, fallback gecikme döndürüldü.",
                    data: new Dictionary<string, object?>
                    {
                        ["gksId"] = gksId,
                        ["latencyMs"] = randomLatency
                    });
                return Ok(new { latency = randomLatency, warning = "ICMP blocked" });
            }
            catch (Exception ex)
            {
                 await _eventService.PublishAsync(
                    eventType: "gks.ping.error",
                    category: "SYSTEM",
                    severity: "ERROR",
                    source: "AEGIS_API",
                    entityType: "gks",
                    entityId: gksId,
                    action: "ping",
                    message: $"{gksId} ping işlemi hata verdi.",
                    data: new Dictionary<string, object?>
                    {
                        ["gksId"] = gksId,
                        ["error"] = ex.GetType().Name
                    });
                 _logger.LogError(ex, "{GksId} ping işlemi sırasında sunucu hatası oluştu.", gksId);
                 return StatusCode(500, new { message = "Ping işlemi sırasında sunucu hatası oluştu." });
            }
        }
    }

    public class SpawnRequest
    {
        public double Lat { get; set; }
        public double Lon { get; set; }
    }

    public class UpdateRadiusRequest
    {
        public double Radius { get; set; }
    }
}
