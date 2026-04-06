using System.Threading;

namespace Aegis_API.Metrics
{
    public interface IGlobalMetricsService
    {
        int FecCount { get; }
        int AttackCount { get; }
        
        void IncrementFecCount(int value = 1);
        void IncrementAttackCount(int value = 1);
        
        void ResetMetrics();
    }

    public class GlobalMetricsService : IGlobalMetricsService
    {
        private int _fecCount = 0;
        private int _attackCount = 0;

        public int FecCount => _fecCount;
        public int AttackCount => _attackCount;

        public void IncrementFecCount(int value = 1)
        {
            Interlocked.Add(ref _fecCount, value);
        }

        public void IncrementAttackCount(int value = 1)
        {
            Interlocked.Add(ref _attackCount, value);
        }

        public void ResetMetrics()
        {
            Interlocked.Exchange(ref _fecCount, 0);
            Interlocked.Exchange(ref _attackCount, 0);
        }
    }
}
