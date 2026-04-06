using StackExchange.Redis;

namespace Aegis_API.Services
{
    public static class RedisKeyScanner
    {
        public static List<RedisKey> ScanKeys(
            IConnectionMultiplexer redis,
            int database,
            string pattern,
            int pageSize = 250)
        {
            var dbIndex = database >= 0 ? database : 0;
            var discovered = new HashSet<string>(StringComparer.Ordinal);

            foreach (var endpoint in redis.GetEndPoints(configuredOnly: false))
            {
                IServer server;
                try
                {
                    server = redis.GetServer(endpoint);
                }
                catch
                {
                    continue;
                }

                if (!server.IsConnected)
                {
                    continue;
                }

                // Prefer primary nodes for keyspace scans.
                if (server.IsReplica)
                {
                    continue;
                }

                foreach (var key in server.Keys(database: dbIndex, pattern: pattern, pageSize: pageSize))
                {
                    discovered.Add(key.ToString());
                }
            }

            return discovered.Select(k => (RedisKey)k).ToList();
        }
    }
}
