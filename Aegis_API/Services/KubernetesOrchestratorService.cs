using k8s;
using k8s.Models;
using StackExchange.Redis;
using System.Net;
using System.Diagnostics;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Aegis_API.Services
{
    public interface IKubernetesOrchestratorService
    {
        Task<bool> SpawnUavAsync(double lat, double lon);
        Task<bool> SpawnGksAsync(double lat, double lon);
        Task<bool> DeleteUavAsync(string uavId);
        Task<bool> DeleteGksAsync(string gksId);
    }

    public class KubernetesOrchestratorService : IKubernetesOrchestratorService
    {
        private readonly ILogger<KubernetesOrchestratorService> _logger;
        private readonly IKubernetes? _client;
        private readonly IConnectionMultiplexer _redis;
        private readonly string _namespace = "default";
        private readonly bool _dockerMode;
        private readonly string? _dockerKeysHostPath;

        public KubernetesOrchestratorService(ILogger<KubernetesOrchestratorService> logger, IConnectionMultiplexer redis)
        {
            _logger = logger;
            _redis = redis;
            _dockerMode = false;
            _dockerKeysHostPath = Environment.GetEnvironmentVariable("HOST_KEYS_PATH");

            try
            {
                var config = KubernetesClientConfiguration.InClusterConfig();
                _client = new Kubernetes(config);
                // Ping the cluster to ensure it's actually alive
                _client.CoreV1.ListNamespacedPod(_namespace, limit: 1);
                _logger.LogInformation("Kubernetes modu aktif — InCluster bağlantısı kuruldu ve doğrulandı.");
            }
            catch
            {
                try
                {
                    var fallbackConfig = KubernetesClientConfiguration.BuildDefaultConfig();
                    _client = new Kubernetes(fallbackConfig);
                    // Ping the cluster to ensure it's actually alive
                    _client.CoreV1.ListNamespacedPod(_namespace, limit: 1);
                    _logger.LogInformation("Kubernetes modu aktif — kubeconfig bağlantısı kuruldu ve doğrulandı.");
                }
                catch
                {
                    _client = null;
                    // Check whether Docker socket is available.
                    if (File.Exists("/var/run/docker.sock"))
                    {
                        _dockerMode = true;
                        _logger.LogInformation("Docker Compose modu aktif — İHA'lar Docker container olarak spawn edilecek.");
                    }
                    else
                    {
                        _logger.LogWarning("Ne K8s ne Docker kullanılabilir. Simülasyon modu aktif.");
                    }
                }
            }
        }

        public async Task<bool> SpawnUavAsync(double lat, double lon)
        {
            // Docker Compose mode
            if (_dockerMode)
            {
                return await SpawnUavDockerAsync(lat, lon);
            }

            // Kubernetes mode
            if (_client != null)
            {
                return await SpawnUavK8sAsync(lat, lon);
            }

            // Fallback simulation mode (no orchestrator available)
            _logger.LogWarning("Simülasyon Modu: İHA sanal olarak oluşturuldu (gerçek container yok).");
            return true;
        }

        public async Task<bool> SpawnGksAsync(double lat, double lon)
        {
            if (_dockerMode)
            {
                return await SpawnGksDockerAsync(lat, lon);
            }

            if (_client != null)
            {
                return await SpawnGksK8sAsync(lat, lon);
            }

            _logger.LogWarning("Simülasyon Modu: GKS sanal olarak oluşturuldu.");
            return true;
        }

        public async Task<bool> DeleteUavAsync(string uavId)
        {
            var numericId = ExtractNumericId(uavId);
            if (string.IsNullOrWhiteSpace(numericId))
            {
                _logger.LogWarning("UAV silme isteği geçersiz ID içeriyor: {UavId}", uavId);
                return false;
            }

            if (_dockerMode)
            {
                _logger.LogInformation("Docker modu: UAV silme talebi -> {UavId} (numeric: {NumericId})", uavId, numericId);
                return await DeleteUavInDockerAsync(numericId);
            }

            if (_client != null)
            {
                _logger.LogInformation("K8s modu: UAV silme talebi -> {UavId} (numeric: {NumericId})", uavId, numericId);
                return await DeleteUavInK8sAsync(numericId);
            }

            _logger.LogWarning("Simülasyon Modu: UAV sanal olarak silindi.");
            return true;
        }

        // ==================== DOCKER COMPOSE MODE ====================
        
        private async Task<bool> SpawnUavDockerAsync(double lat, double lon)
        {
            if (string.IsNullOrWhiteSpace(_dockerKeysHostPath))
            {
                _logger.LogError("Docker modu UAV spawn engellendi: HOST_KEYS_PATH environment variable eksik.");
                return false;
            }

            var uavNumericId = GenerateUavNumericId();
            var containerName = $"aegis-uav-{uavNumericId}-{Guid.NewGuid().ToString("N")[..6]}";
            _logger.LogInformation("Docker Spawn: {ContainerName} (İHA-{UavNumericId}) -> Lat: {Lat}, Lon: {Lon}", containerName, uavNumericId, lat, lon);

            var args = $"run -d --name {containerName} " +
                       $"--label app=aegis-uav " +
                       $"--label uav-id={uavNumericId} " +
                       $"--network aegis-c2_default " +
                       $"-v \"{_dockerKeysHostPath}\":/keys:ro " +
                       $"-e UAV_ID={uavNumericId} " +
                       $"-e UAV_LAT={lat.ToString(System.Globalization.CultureInfo.InvariantCulture)} " +
                       $"-e UAV_LON={lon.ToString(System.Globalization.CultureInfo.InvariantCulture)} " +
                       $"aegis-c2-aegis_uav:latest";

            return await RunDockerCommand(args, containerName);
        }

        private async Task<bool> SpawnGksDockerAsync(double lat, double lon)
        {
            if (string.IsNullOrWhiteSpace(_dockerKeysHostPath))
            {
                _logger.LogError("Docker modu GKS spawn engellendi: HOST_KEYS_PATH environment variable eksik.");
                return false;
            }

            var gksNumericId = new Random().Next(100, 999);
            var gksId = $"aegis-gks-{gksNumericId}";
            _logger.LogInformation("Docker Spawn: Yeni GKS instance -> {GksId} at {Lat}, {Lon}", gksId, lat, lon);

            var dbPass = Environment.GetEnvironmentVariable("DB_PASS");
            if (string.IsNullOrWhiteSpace(dbPass))
            {
                _logger.LogError("Docker modu GKS spawn engellendi: DB_PASS environment variable eksik.");
                return false;
            }

            var escapedDbPass = dbPass.Replace("\"", "\\\"");

            var args = $"run -d --name {gksId} " +
                       $"--network aegis-c2_default " +
                       $"-v \"{_dockerKeysHostPath}\":/app/keys:ro " +
                       $"-e DB_HOST=aegis_db " +
                       $"-e DB_USER=admin " +
                       $"-e DB_PASS=\"{escapedDbPass}\" " +
                       $"-e DB_NAME=aegis_hq " +
                       $"-e REDIS_HOST=redis_db " +
                       $"-e GKS_HOST={gksId} " +
                       $"-e GKS_ID={gksNumericId} " +
                       $"-e GKS_LAT={lat.ToString(System.Globalization.CultureInfo.InvariantCulture)} " +
                       $"-e GKS_LON={lon.ToString(System.Globalization.CultureInfo.InvariantCulture)} " +
                       $"aegis-c2-aegis_gks:latest " +
                       $"python -u server.py";

            return await RunDockerCommand(args, gksId);
        }

        private async Task<bool> DeleteUavInDockerAsync(string numericId)
        {
            var listResult = await RunCommandAsync("docker", $"ps -aq --filter label=app=aegis-uav --filter label=uav-id={numericId}");
            if (listResult.ExitCode != 0)
            {
                _logger.LogError("Docker UAV listesi alınamadı: {Error}", listResult.StdErr);
                return false;
            }

            var containerIds = listResult.StdOut
                .Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)
                .Distinct()
                .ToList();

            if (containerIds.Count == 0)
            {
                _logger.LogInformation("Docker'da silinecek UAV bulunamadı (uav-id={UavId}).", numericId);
                return true;
            }

            foreach (var containerId in containerIds)
            {
                var removeResult = await RunCommandAsync("docker", $"rm -f {containerId}");
                if (removeResult.ExitCode != 0)
                {
                    _logger.LogError("Docker UAV container silinemedi: {ContainerId} -> {Error}", containerId, removeResult.StdErr);
                    return false;
                }
            }

            _logger.LogInformation("Docker UAV container(lar) silindi: uav-id={UavId}", numericId);
            return true;
        }

        private async Task<bool> RunDockerCommand(string args, string containerName)
        {
            try
            {
                var result = await RunCommandAsync("docker", args);

                if (result.ExitCode == 0)
                {
                    _logger.LogInformation("Container başarıyla oluşturuldu: {Name}", containerName);
                    return true;
                }

                _logger.LogError("Container oluşturulamadı: {Error}", result.StdErr);
                return false;
            }
            catch (Exception ex)
            {
                _logger.LogError("Docker komutu çalıştırılamadı: {Error}", ex.Message);
                return false;
            }
        }

        private async Task<(int ExitCode, string StdOut, string StdErr)> RunCommandAsync(string fileName, string arguments)
        {
            var process = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = fileName,
                    Arguments = arguments,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                }
            };

            process.Start();
            var outputTask = process.StandardOutput.ReadToEndAsync();
            var errorTask = process.StandardError.ReadToEndAsync();

            await process.WaitForExitAsync();
            var output = await outputTask;
            var error = await errorTask;

            return (process.ExitCode, output, error);
        }

        // ==================== KUBERNETES MODE ====================

        private async Task<bool> SpawnUavK8sAsync(double lat, double lon)
        {
            _logger.LogInformation("K8s Spawn: UAV -> Lat: {Lat}, Lon: {Lon}", lat, lon);
            var preferredGksHost = await ResolvePreferredGksHostAsync(lat, lon);
            var uavNumericId = GenerateUavNumericId();

            var pod = new V1Pod
            {
                Metadata = new V1ObjectMeta
                {
                    GenerateName = $"aegis-uav-{uavNumericId}-",
                    Labels = new Dictionary<string, string>
                    {
                        { "app", "aegis-uav" },
                        { "uav-id", uavNumericId }
                    }
                },
                Spec = new V1PodSpec
                {
                    Containers = new List<V1Container>
                    {
                        new V1Container
                        {
                            Name = "aegis-uav",
                            Image = "aegis-c2-aegis_uav:latest",
                            ImagePullPolicy = "IfNotPresent",
                            Env = new List<V1EnvVar>
                            {
                                new V1EnvVar { Name = "UAV_ID", Value = uavNumericId },
                                new V1EnvVar { Name = "UAV_LAT", Value = lat.ToString(System.Globalization.CultureInfo.InvariantCulture) },
                                new V1EnvVar { Name = "UAV_LON", Value = lon.ToString(System.Globalization.CultureInfo.InvariantCulture) },
                                new V1EnvVar { Name = "GKS_HOST", Value = preferredGksHost }
                            },
                            VolumeMounts = new List<V1VolumeMount>
                            {
                                new V1VolumeMount { Name = "keys-volume", MountPath = "/keys" }
                            }
                        }
                    },
                    RestartPolicy = "Never",
                    Volumes = new List<V1Volume>
                    {
                        new V1Volume
                        {
                            Name = "keys-volume",
                            Secret = new V1SecretVolumeSource { SecretName = "crypto-keys" }
                        }
                    }
                }
            };

            try
            {
                var result = await _client!.CoreV1.CreateNamespacedPodAsync(pod, _namespace);
                _logger.LogInformation("K8s UAV Pod spawned: {Name} (İHA-{UavNumericId})", result.Metadata.Name, uavNumericId);
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError("K8s UAV spawn hatası: {Error}", ex.Message);
                return false;
            }
        }

        private async Task<bool> DeleteUavInK8sAsync(string numericId)
        {
            try
            {
                var pods = await _client!.CoreV1.ListNamespacedPodAsync(_namespace, labelSelector: "app=aegis-uav");
                var candidates = pods.Items.Where(p => IsMatchingUavPod(p, numericId)).ToList();

                // For legacy pods without uav-id label/env, try to resolve UAV ID from logs.
                if (candidates.Count == 0)
                {
                    foreach (var pod in pods.Items)
                    {
                        var podName = pod.Metadata?.Name;
                        if (string.IsNullOrWhiteSpace(podName)) continue;
                        if (await IsMatchingUavPodFromLogsAsync(podName, numericId))
                        {
                            candidates.Add(pod);
                            break;
                        }
                    }
                }

                if (candidates.Count == 0)
                {
                    _logger.LogWarning("Silinecek UAV pod bulunamadı. İstenen UAV ID: {UavId}", numericId);
                    return false;
                }

                foreach (var pod in candidates)
                {
                    var podName = pod.Metadata?.Name;
                    if (string.IsNullOrWhiteSpace(podName)) continue;

                    try
                    {
                        await _client.CoreV1.DeleteNamespacedPodAsync(
                            podName,
                            _namespace,
                            gracePeriodSeconds: 0,
                            body: new V1DeleteOptions { GracePeriodSeconds = 0 });
                        _logger.LogInformation("K8s UAV Pod silindi: {PodName}", podName);
                    }
                    catch (k8s.Autorest.HttpOperationException ex) when (ex.Response.StatusCode == HttpStatusCode.NotFound)
                    {
                        _logger.LogInformation("K8s UAV Pod zaten silinmiş: {PodName}", podName);
                    }
                }

                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError("K8s UAV silme hatası: {Error}", ex.Message);
                return false;
            }
        }

        private bool IsMatchingUavPod(V1Pod pod, string numericId)
        {
            var labels = pod.Metadata?.Labels;
            if (labels != null && labels.TryGetValue("uav-id", out var labelUavId) && labelUavId == numericId)
            {
                return true;
            }

            var envUavId = pod.Spec?.Containers?
                .SelectMany(c => c.Env ?? new List<V1EnvVar>())
                .FirstOrDefault(e => e.Name == "UAV_ID")?.Value;
            if (envUavId == numericId)
            {
                return true;
            }

            var podName = pod.Metadata?.Name ?? string.Empty;
            return podName.Contains($"uav-{numericId}-", StringComparison.OrdinalIgnoreCase) ||
                   podName.EndsWith($"uav-{numericId}", StringComparison.OrdinalIgnoreCase);
        }

        private async Task<bool> IsMatchingUavPodFromLogsAsync(string podName, string numericId)
        {
            try
            {
                await using var logStream = await _client!.CoreV1.ReadNamespacedPodLogAsync(
                    podName,
                    _namespace,
                    tailLines: 5000);
                using var reader = new StreamReader(logStream);
                var logs = await reader.ReadToEndAsync();

                if (string.IsNullOrWhiteSpace(logs))
                {
                    return false;
                }

                var match = Regex.Match(logs, @"(?:UAV|IHA|İHA)-(?<id>\d+)", RegexOptions.CultureInvariant);
                return match.Success && string.Equals(match.Groups["id"].Value, numericId, StringComparison.Ordinal);
            }
            catch
            {
                return false;
            }
        }

        private async Task<string> ResolvePreferredGksHostAsync(double uavLat, double uavLon)
        {
            const string fallbackHost = "aegis-gks-service";

            try
            {
                var liveGksPodIps = new HashSet<string>(StringComparer.Ordinal);
                if (_client != null)
                {
                    try
                    {
                        var gksPods = await _client.CoreV1.ListNamespacedPodAsync(_namespace, labelSelector: "app=aegis-gks");
                        foreach (var pod in gksPods.Items)
                        {
                            var phase = pod.Status?.Phase ?? string.Empty;
                            var ip = pod.Status?.PodIP;
                            if (string.Equals(phase, "Running", StringComparison.OrdinalIgnoreCase) &&
                                !string.IsNullOrWhiteSpace(ip))
                            {
                                liveGksPodIps.Add(ip);
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning("Canlı GKS pod IP listesi alınamadı: {Error}", ex.Message);
                    }
                }

                var db = _redis.GetDatabase();
                var keys = RedisKeyScanner.ScanKeys(_redis, db.Database, "gks_instance:*");
                if (keys.Count == 0)
                {
                    return fallbackHost;
                }

                var nowEpoch = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                string? bestInRangeHost = null;
                var bestInRangeDistance = double.MaxValue;
                string? bestAnyHost = null;
                var bestAnyDistance = double.MaxValue;

                foreach (var key in keys)
                {
                    var keyText = key.ToString();
                    var raw = await db.StringGetAsync(key);
                    if (!raw.HasValue) continue;

                    using var doc = JsonDocument.Parse(raw.ToString());
                    var root = doc.RootElement;

                    if (!root.TryGetProperty("lat", out var latProp) || !root.TryGetProperty("lng", out var lonProp))
                    {
                        continue;
                    }

                    var gksLat = latProp.GetDouble();
                    var gksLon = lonProp.GetDouble();
                    var gksRadius = root.TryGetProperty("radius", out var radiusProp) ? radiusProp.GetDouble() : 50.0;

                    // Filter stale registry entries to avoid selecting terminating/dead GKS.
                    if (root.TryGetProperty("timestamp", out var tsProp) && tsProp.TryGetInt64(out var ts))
                    {
                        if (Math.Abs(nowEpoch - ts) > 25) continue;
                    }

                    var gksHost = root.TryGetProperty("host", out var hostProp) ? hostProp.GetString() : null;

                    // Dynamic GKS without explicit host is not routable reliably from UAV pod.
                    if (string.IsNullOrWhiteSpace(gksHost))
                    {
                        if (keyText.EndsWith(":42", StringComparison.Ordinal))
                        {
                            gksHost = "aegis-gks-service";
                        }
                        else
                        {
                            continue;
                        }
                    }

                    // Do not select dead/stale pod IP entries even if they still exist in Redis.
                    if (IPAddress.TryParse(gksHost, out _) &&
                        liveGksPodIps.Count > 0 &&
                        !liveGksPodIps.Contains(gksHost))
                    {
                        continue;
                    }

                    var distance = CalculateDistanceKm(uavLat, uavLon, gksLat, gksLon);
                    if (distance < bestAnyDistance)
                    {
                        bestAnyDistance = distance;
                        bestAnyHost = gksHost;
                    }

                    if (distance <= gksRadius && distance < bestInRangeDistance)
                    {
                        bestInRangeDistance = distance;
                        bestInRangeHost = gksHost;
                    }
                }

                var selected = bestInRangeHost ?? bestAnyHost ?? fallbackHost;
                _logger.LogInformation(
                    "UAV başlangıç GKS host seçimi: {Host} (inRangeDistance={InRangeDistance}, anyDistance={AnyDistance})",
                    selected,
                    bestInRangeDistance == double.MaxValue ? -1 : bestInRangeDistance,
                    bestAnyDistance == double.MaxValue ? -1 : bestAnyDistance);

                return selected;
            }
            catch (Exception ex)
            {
                _logger.LogWarning("UAV başlangıç GKS host seçimi sırasında hata: {Error}", ex.Message);
                return fallbackHost;
            }
        }

        private static double CalculateDistanceKm(double lat1, double lon1, double lat2, double lon2)
        {
            const double r = 6371.0;
            var dLat = (lat2 - lat1) * Math.PI / 180.0;
            var dLon = (lon2 - lon1) * Math.PI / 180.0;
            var a = Math.Sin(dLat / 2.0) * Math.Sin(dLat / 2.0) +
                    Math.Cos(lat1 * Math.PI / 180.0) * Math.Cos(lat2 * Math.PI / 180.0) *
                    Math.Sin(dLon / 2.0) * Math.Sin(dLon / 2.0);
            var c = 2.0 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1.0 - a));
            return r * c;
        }

        private async Task<bool> SpawnGksK8sAsync(double lat, double lon)
        {
            var gksNumericId = new Random().Next(100, 999);
            var gksName = $"aegis-gks-{gksNumericId}";
            _logger.LogInformation("K8s Spawn: GKS instance -> {Name} at {Lat}, {Lon}", gksName, lat, lon);
            
            var pod = new V1Pod
            {
                Metadata = new V1ObjectMeta
                {
                    Name = gksName,
                    Labels = new Dictionary<string, string> { { "app", "aegis-gks" }, { "gks-id", gksNumericId.ToString() } }
                },
                Spec = new V1PodSpec
                {
                    Containers = new List<V1Container>
                    {
                        new V1Container
                        {
                            Name = "aegis-gks",
                            Image = "aegis-c2-aegis_gks:latest",
                            ImagePullPolicy = "IfNotPresent",
                            Env = new List<V1EnvVar>
                            {
                                new V1EnvVar { Name = "DB_HOST", Value = "aegis-db-service" },
                                new V1EnvVar { Name = "DB_USER", Value = "admin" },
                                new V1EnvVar { Name = "DB_PASS", ValueFrom = new V1EnvVarSource { SecretKeyRef = new V1SecretKeySelector { Name = "aegis-secrets", Key = "POSTGRES_PASSWORD" } } },
                                new V1EnvVar { Name = "DB_NAME", Value = "aegis_hq" },
                                new V1EnvVar { Name = "REDIS_HOST", Value = "redis-service" },
                                new V1EnvVar
                                {
                                    Name = "POD_IP",
                                    ValueFrom = new V1EnvVarSource
                                    {
                                        FieldRef = new V1ObjectFieldSelector
                                        {
                                            FieldPath = "status.podIP"
                                        }
                                    }
                                },
                                new V1EnvVar { Name = "GKS_ID", Value = gksNumericId.ToString() },
                                new V1EnvVar { Name = "GKS_LAT", Value = lat.ToString(System.Globalization.CultureInfo.InvariantCulture) },
                                new V1EnvVar { Name = "GKS_LON", Value = lon.ToString(System.Globalization.CultureInfo.InvariantCulture) }
                            },
                            VolumeMounts = new List<V1VolumeMount>
                            {
                                new V1VolumeMount { Name = "keys-volume", MountPath = "/app/keys" }
                            }
                        }
                    },
                    RestartPolicy = "Always",
                    Volumes = new List<V1Volume>
                    {
                        new V1Volume
                        {
                            Name = "keys-volume",
                            Secret = new V1SecretVolumeSource { SecretName = "crypto-keys" }
                        }
                    }
                }
            };

            try
            {
                var result = await _client!.CoreV1.CreateNamespacedPodAsync(pod, _namespace);
                _logger.LogInformation("K8s GKS Pod spawned: {Name}", result.Metadata.Name);
                
                // Optional: a dedicated Service can be created for this GKS instance.
                // Current handover flow communicates directly with Pod IP for UDP traffic.
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError("K8s GKS spawn hatası: {Error}", ex.Message);
                return false;
            }
        }

        public async Task<bool> DeleteGksAsync(string gksId)
        {
            // Normalize inputs such as "GKS-42", "gks-42" or "42"
            var normalized = gksId.Trim().ToLowerInvariant();
            var numericId = normalized.StartsWith("gks-") ? normalized.Replace("gks-", "") : normalized;
            var podSuffix = normalized.StartsWith("gks-") ? normalized : $"gks-{numericId}";
            var podName = $"aegis-{podSuffix}";

            if (_dockerMode)
            {
                _logger.LogInformation("Docker modu: GKS silme talebi -> {GksId} (pod/container: {PodName})", gksId, podName);
                return await DeleteGksInDockerAsync(podName, numericId);
            }

            if (_client != null)
            {
                _logger.LogInformation("K8s modu: GKS silme talebi -> {GksId} (pod: {PodName})", gksId, podName);
                try
                {
                    // 1) Try direct pod deletion first (works for dynamically spawned pods).
                    await _client.CoreV1.DeleteNamespacedPodAsync(podName, _namespace);
                    _logger.LogInformation("K8s GKS Pod silindi: {Name}", podName);
                    return true;
                }
                catch (k8s.Autorest.HttpOperationException ex) when (ex.Response.StatusCode == System.Net.HttpStatusCode.NotFound)
                {
                    // 2) Pod name-based deletion failed. Locate candidate pods by exact name or gks-id label.
                    var pods = await _client.CoreV1.ListNamespacedPodAsync(_namespace, labelSelector: $"app=aegis-gks");
                    var targetPod = pods.Items.FirstOrDefault(p =>
                        string.Equals(p.Metadata?.Name, podName, StringComparison.OrdinalIgnoreCase)) ??
                        pods.Items.FirstOrDefault(p =>
                        (p.Metadata?.Labels != null &&
                         p.Metadata.Labels.ContainsKey("gks-id") &&
                         p.Metadata.Labels["gks-id"] == numericId) ||
                        (p.Metadata?.Name?.Contains($"gks-{numericId}") ?? false));

                    if (targetPod != null)
                    {
                        var controlledByReplicaSet = targetPod.Metadata?.OwnerReferences?.Any(o => o.Controller == true && o.Kind == "ReplicaSet") == true;
                        if (controlledByReplicaSet)
                        {
                            // Pod is managed by Deployment/ReplicaSet; deleting pod alone will recreate it.
                            var scaledManaged = await TryScaleDownStaticGksDeploymentAsync(numericId);
                            if (scaledManaged) return true;
                        }
                        else
                        {
                            await _client.CoreV1.DeleteNamespacedPodAsync(targetPod.Metadata!.Name!, _namespace);
                            _logger.LogInformation("K8s GKS dinamik pod silindi: {Name}", targetPod.Metadata!.Name);
                            return true;
                        }
                    }

                    // 3) If this is the baseline Helm deployment GKS (typically ID 42),
                    // delete-by-pod never works because Deployment recreates it.
                    var scaled = await TryScaleDownStaticGksDeploymentAsync(numericId);
                    if (scaled) return true;

                    // Idempotent delete: if target is already absent, treat as success.
                    _logger.LogInformation(
                        "GKS zaten silinmiş veya bulunamadı. İstenen: {GksId}, pod adayı: {PodName}",
                        gksId,
                        podName);
                    return true;
                }
                catch (Exception ex)
                {
                    _logger.LogError("K8s GKS silme hatası: {Error}", ex.Message);
                    return false;
                }
            }

            _logger.LogWarning("Simülasyon Modu: GKS sanal olarak silindi.");
            return true;
        }

        private async Task<bool> DeleteGksInDockerAsync(string podName, string numericId)
        {
            // rm -f removes both running and stopped containers.
            var candidates = new List<string> { podName, $"aegis-gks-{numericId}" };

            // docker-compose base service defaults to this name.
            if (numericId == "42")
            {
                candidates.Add("aegis_gks");
            }

            foreach (var candidate in candidates.Distinct())
            {
                if (await RunDockerCommand($"rm -f {candidate}", candidate))
                {
                    _logger.LogInformation("Docker GKS container silindi: {Name}", candidate);
                    return true;
                }
            }

            _logger.LogWarning("Docker'da silinecek GKS container bulunamadı. Adaylar: {Candidates}", string.Join(", ", candidates));
            return false;
        }

        private async Task<bool> TryScaleDownStaticGksDeploymentAsync(string numericId)
        {
            const int maxAttempts = 3;
            for (var attempt = 1; attempt <= maxAttempts; attempt++)
            {
                try
                {
                    var deployment = await _client!.AppsV1.ReadNamespacedDeploymentAsync("aegis-gks", _namespace);
                    if (deployment?.Spec == null)
                    {
                        return false;
                    }

                    var configuredGksId = deployment.Spec.Template?.Spec?.Containers?
                        .SelectMany(c => c.Env ?? new List<V1EnvVar>())
                        .FirstOrDefault(e => e.Name == "GKS_ID")?.Value ?? "42";

                    if (configuredGksId != numericId)
                    {
                        return false;
                    }

                    var currentReplicas = deployment.Spec.Replicas ?? 1;
                    if (currentReplicas <= 0)
                    {
                        return true;
                    }

                    deployment.Spec.Replicas = currentReplicas - 1;
                    await _client.AppsV1.ReplaceNamespacedDeploymentAsync(deployment, deployment.Metadata!.Name!, _namespace);

                    // Kill matching pods immediately so they cannot keep re-registering in Redis while terminating.
                    await ForceDeleteMatchingGksPodsAsync(numericId);

                    _logger.LogInformation(
                        "Static GKS deployment ölçeklendirildi: {Deployment} replicas {Old} -> {New}",
                        deployment.Metadata.Name,
                        currentReplicas,
                        deployment.Spec.Replicas);

                    return true;
                }
                catch (k8s.Autorest.HttpOperationException ex) when (ex.Response.StatusCode == System.Net.HttpStatusCode.NotFound)
                {
                    return false;
                }
                catch (k8s.Autorest.HttpOperationException ex) when (ex.Response.StatusCode == System.Net.HttpStatusCode.Conflict)
                {
                    // Concurrent delete calls can race on deployment resourceVersion.
                    // Re-read state and retry.
                    if (attempt == maxAttempts)
                    {
                        try
                        {
                            var latest = await _client!.AppsV1.ReadNamespacedDeploymentAsync("aegis-gks", _namespace);
                            var replicas = latest?.Spec?.Replicas ?? 0;
                            if (replicas <= 0)
                            {
                                return true;
                            }
                        }
                        catch
                        {
                            // fall through to warning below
                        }

                        _logger.LogWarning(
                            "Static GKS deployment ölçekleme conflict sonrası başarısız. Attempt={Attempt}/{MaxAttempts}",
                            attempt,
                            maxAttempts);
                        return false;
                    }

                    await Task.Delay(100);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning("Static GKS deployment ölçekleme başarısız: {Error}", ex.Message);
                    return false;
                }
            }

            return false;
        }

        private async Task ForceDeleteMatchingGksPodsAsync(string numericId)
        {
            try
            {
                var pods = await _client!.CoreV1.ListNamespacedPodAsync(_namespace, labelSelector: "app=aegis-gks");
                var targets = pods.Items.Where(p => IsMatchingGksPod(p, numericId)).ToList();

                foreach (var pod in targets)
                {
                    var podName = pod.Metadata?.Name;
                    if (string.IsNullOrWhiteSpace(podName)) continue;

                    try
                    {
                        await _client.CoreV1.DeleteNamespacedPodAsync(
                            podName,
                            _namespace,
                            gracePeriodSeconds: 0,
                            body: new V1DeleteOptions { GracePeriodSeconds = 0 });
                    }
                    catch
                    {
                        // Best-effort cleanup; scaling already requested.
                    }
                }
            }
            catch
            {
                // Best-effort cleanup; scaling already requested.
            }
        }

        private static bool IsMatchingGksPod(V1Pod pod, string numericId)
        {
            var labels = pod.Metadata?.Labels;

            if (labels != null && labels.TryGetValue("gks-id", out var podGksId))
            {
                return podGksId == numericId;
            }

            // Static helm deployment pod has no gks-id label; treat it as 42.
            if (numericId == "42")
            {
                return true;
            }

            var name = pod.Metadata?.Name ?? string.Empty;
            return name.Contains($"gks-{numericId}", StringComparison.OrdinalIgnoreCase);
        }

        private static string GenerateUavNumericId()
        {
            return Random.Shared.Next(100000, 999999).ToString();
        }

        private static string ExtractNumericId(string rawId)
        {
            if (string.IsNullOrWhiteSpace(rawId))
            {
                return string.Empty;
            }

            return new string(rawId.Where(char.IsDigit).ToArray());
        }
    }
}
