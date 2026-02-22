CREATE TABLE IF NOT EXISTS uav_registery(
    uav_id INTEGER PRIMARY KEY,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS flight_sessions(
    session_id SERIAL PRIMARY KEY,
    uav_id INTEGER REFERENCES uav_registery(uav_id),
    start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP
);

CREATE TABLE IF NOT EXISTS telemetry_logs(
    log_id BIGSERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES flight_sessions(session_id),
    gks_id INTEGER NOT NULL,
    seq_num INTEGER NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    altitude REAL NOT NULL,
    speed REAL NOT NULL,
    battery REAL NOT NULL,
    flight_mode SMALLINT NOT NULL,
    priority SMALLINT NOT NULL,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_telemetry_time ON telemetry_logs(recorded_at);
CREATE INDEX IF NOT EXISTS idx_uav_session ON telemetry_logs(session_id);