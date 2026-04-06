#ifndef TELEMETRY_SENSOR_HPP
#define TELEMETRY_SENSOR_HPP

#include "Packets.hpp"

#include <vector>

struct TargetPoint {
    double lat;
    double lon;
};

class TelemetrySensor {
private:
    double current_lat;
    double current_lon;
    std::vector<TargetPoint> waypoints;
    float battery;
    uint32_t current_seq;

public:
    TelemetrySensor(double start_lat = 37.8000, double start_lon = 32.4000);
    void set_waypoints(const std::vector<TargetPoint>& new_waypoints);
    PlaintextTelemetry create_telemetry_tick(uint32_t interval_ms);
    void apply_tactical_command(const TacticalCmd& cmd);

    // Internal telemetry state
    float current_speed = 40.0f;
    float current_altitude = 500.0f;
    float actual_speed = 0.0f; // Represents the physical speed of the UAV
    bool manual_speed_override = false;
    double heading_rad = 0.0;

    enum class ManeuverState {
        NONE,
        ORBIT_TARGET,
        FIGURE_8,
        EVASIVE_MANEUVER
    };
    
    // Advanced maneuver state variables
    ManeuverState current_maneuver = ManeuverState::NONE;
    double maneuver_center_lat = 0.0;
    double maneuver_center_lon = 0.0;
    double time_counter = 0.0;
};

#endif // TELEMETRY_SENSOR_HPP
