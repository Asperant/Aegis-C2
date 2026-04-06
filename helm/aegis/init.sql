-- =============================================
-- AEGIS C2 — DATABASE SCHEMA
-- =============================================

-- 1. İHA Kayıt Tablosu
CREATE TABLE IF NOT EXISTS uav_registry(
    uav_id INTEGER PRIMARY KEY,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Uçuş Oturumu Tablosu
CREATE TABLE IF NOT EXISTS flight_sessions(
    session_id SERIAL PRIMARY KEY,
    uav_id INTEGER REFERENCES uav_registry(uav_id),
    start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_flight_sessions_active
    ON flight_sessions(uav_id) WHERE end_time IS NULL;

-- 3. Telemetri Logları (Zaman Bazlı Partitioned)
CREATE TABLE IF NOT EXISTS telemetry_logs(
    log_id BIGSERIAL,
    session_id INTEGER NOT NULL,
    gks_id INTEGER NOT NULL,
    seq_num INTEGER NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    altitude REAL NOT NULL,
    speed REAL NOT NULL,
    battery REAL NOT NULL,
    flight_mode SMALLINT NOT NULL,
    priority SMALLINT NOT NULL,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (log_id, recorded_at)
) PARTITION BY RANGE (recorded_at);

-- Aylık Partition Tabloları (3 aylık başlangıç)
CREATE TABLE IF NOT EXISTS telemetry_logs_2026_03 PARTITION OF telemetry_logs
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

CREATE TABLE IF NOT EXISTS telemetry_logs_2026_04 PARTITION OF telemetry_logs
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

CREATE TABLE IF NOT EXISTS telemetry_logs_2026_05 PARTITION OF telemetry_logs
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

-- Varsayılan partition (tanımlı aralık dışındaki veriler için)
CREATE TABLE IF NOT EXISTS telemetry_logs_default PARTITION OF telemetry_logs DEFAULT;

CREATE INDEX IF NOT EXISTS idx_telemetry_time ON telemetry_logs(recorded_at);
CREATE INDEX IF NOT EXISTS idx_uav_session ON telemetry_logs(session_id);

-- 4. Komut Denetim Loglari
CREATE TABLE IF NOT EXISTS command_audit_logs(
    log_id BIGSERIAL PRIMARY KEY,
    uav_id VARCHAR(20) NOT NULL,
    command_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING',
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);