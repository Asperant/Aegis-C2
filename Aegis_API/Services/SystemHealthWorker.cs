using Microsoft.AspNetCore.SignalR;
using System.Diagnostics;
using System.Text.Json;
using Aegis_API.Hubs;
using Aegis_API.Metrics;
using Aegis_API.Services;

namespace Aegis_API.Workers
{
    public class SystemHealthWorker : BackgroundService
    {
        private readonly IHubContext<TelemetryHub> _hubContext;
        private readonly IGlobalMetricsService _metricsService;
        private readonly ILogger<SystemHealthWorker> _logger;
        private readonly IOperationalEventService _eventService;

        public SystemHealthWorker(
            IHubContext<TelemetryHub> hubContext,
            IGlobalMetricsService metricsService,
            ILogger<SystemHealthWorker> logger,
            IOperationalEventService eventService)
        {
            _hubContext = hubContext;
            _metricsService = metricsService;
            _logger = logger;
            _eventService = eventService;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            var process = Process.GetCurrentProcess();
            var lastCpuTime = process.TotalProcessorTime;
            var lastTime = DateTime.UtcNow;
            var cpuCount = Environment.ProcessorCount;

            _logger.LogInformation("SystemHealthWorker başlatıldı.");
            var highCpuAlerted = false;
            var highRamAlerted = false;

            while (!stoppingToken.IsCancellationRequested)
            {
                await Task.Delay(2000, stoppingToken);

                var currentTime = DateTime.UtcNow;
                var currentCpuTime = process.TotalProcessorTime;

                var cpuUsedMs = (currentCpuTime - lastCpuTime).TotalMilliseconds;
                var totalMsPassed = (currentTime - lastTime).TotalMilliseconds;
                var cpuUsageTotal = cpuUsedMs / (cpuCount * totalMsPassed);
                var cpuPercentage = (int)(cpuUsageTotal * 100);

                process.Refresh(); 
                var ramUsageMB = (int)(process.WorkingSet64 / 1024 / 1024);

                var healthData = new
                {
                    Cpu = cpuPercentage,
                    Ram = ramUsageMB,
                    FecCount = _metricsService.FecCount,
                    AttackCount = _metricsService.AttackCount
                };

                await _hubContext.Clients.All.SendAsync("ReceiveSystemHealth", JsonSerializer.Serialize(healthData), stoppingToken);

                if (cpuPercentage >= 85 && !highCpuAlerted)
                {
                    highCpuAlerted = true;
                    await _eventService.PublishAsync(
                        eventType: "system.health.cpu_high",
                        category: "SYSTEM",
                        severity: "WARN",
                        source: "AEGIS_API",
                        entityType: "system",
                        entityId: "api-node",
                        action: "health_alert",
                        message: $"API CPU kullanımı kritik eşiği geçti: %{cpuPercentage}.",
                        data: new Dictionary<string, object?>
                        {
                            ["cpu"] = cpuPercentage
                        },
                        stoppingToken);
                }
                else if (cpuPercentage < 70 && highCpuAlerted)
                {
                    highCpuAlerted = false;
                    await _eventService.PublishAsync(
                        eventType: "system.health.cpu_recovered",
                        category: "SYSTEM",
                        severity: "INFO",
                        source: "AEGIS_API",
                        entityType: "system",
                        entityId: "api-node",
                        action: "health_recovered",
                        message: $"API CPU kullanımı normale döndü: %{cpuPercentage}.",
                        data: new Dictionary<string, object?>
                        {
                            ["cpu"] = cpuPercentage
                        },
                        stoppingToken);
                }

                if (ramUsageMB >= 1500 && !highRamAlerted)
                {
                    highRamAlerted = true;
                    await _eventService.PublishAsync(
                        eventType: "system.health.ram_high",
                        category: "SYSTEM",
                        severity: "WARN",
                        source: "AEGIS_API",
                        entityType: "system",
                        entityId: "api-node",
                        action: "health_alert",
                        message: $"API RAM kullanımı yüksek seviyede: {ramUsageMB}MB.",
                        data: new Dictionary<string, object?>
                        {
                            ["ramMb"] = ramUsageMB
                        },
                        stoppingToken);
                }
                else if (ramUsageMB < 1200 && highRamAlerted)
                {
                    highRamAlerted = false;
                    await _eventService.PublishAsync(
                        eventType: "system.health.ram_recovered",
                        category: "SYSTEM",
                        severity: "INFO",
                        source: "AEGIS_API",
                        entityType: "system",
                        entityId: "api-node",
                        action: "health_recovered",
                        message: $"API RAM kullanımı normale döndü: {ramUsageMB}MB.",
                        data: new Dictionary<string, object?>
                        {
                            ["ramMb"] = ramUsageMB
                        },
                        stoppingToken);
                }

                lastCpuTime = currentCpuTime;
                lastTime = currentTime;
            }
        }
    }
}
