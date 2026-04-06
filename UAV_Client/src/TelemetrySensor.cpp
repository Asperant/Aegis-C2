#include "TelemetrySensor.hpp"
#include <chrono>
#include <cmath>

extern uint64_t get_time_ms(); // Implemented in shared runtime utility.

TelemetrySensor::TelemetrySensor(double initial_lat, double initial_lon) 
    : current_lat(initial_lat), current_lon(initial_lon), battery(100.0f), current_seq(1),
      current_speed(40.0f), current_altitude(500.0f) {}

void TelemetrySensor::set_waypoints(const std::vector<TargetPoint>& new_waypoints) {
    waypoints = new_waypoints;
    if (!new_waypoints.empty()) {
        manual_speed_override = false;
    }
}

void TelemetrySensor::apply_tactical_command(const TacticalCmd& cmd) {
    switch (cmd.id) {
        case 5: // SPEED_INC
            current_speed += 5.0f;
            if (current_speed > 120.0f) current_speed = 120.0f;
            manual_speed_override = true;
            break;
        case 6: // SPEED_DEC
            current_speed -= 5.0f;
            if (current_speed < 0.0f) current_speed = 0.0f;
            manual_speed_override = true;
            break;
        case 7: // ALT_INC
            current_altitude += 50.0f;
            if (current_altitude > 10000.0f) current_altitude = 10000.0f;
            break;
        case 8: // ALT_DEC
            current_altitude -= 50.0f;
            if (current_altitude < 0.0f) current_altitude = 0.0f;
            break;
        case 9: // ORBIT_TARGET
            current_maneuver = ManeuverState::ORBIT_TARGET;
            maneuver_center_lat = (cmd.lat != 0.0) ? cmd.lat : current_lat;
            maneuver_center_lon = (cmd.lon != 0.0) ? cmd.lon : current_lon;
            time_counter = 0.0;
            break;
        case 10: // FIGURE_8
            current_maneuver = ManeuverState::FIGURE_8;
            maneuver_center_lat = (cmd.lat != 0.0) ? cmd.lat : current_lat;
            maneuver_center_lon = (cmd.lon != 0.0) ? cmd.lon : current_lon;
            time_counter = 0.0;
            break;
        case 11: // EVASIVE_MANEUVER
            current_maneuver = ManeuverState::EVASIVE_MANEUVER;
            maneuver_center_lat = (cmd.lat != 0.0) ? cmd.lat : current_lat;
            maneuver_center_lon = (cmd.lon != 0.0) ? cmd.lon : current_lon;
            time_counter = 0.0;
            break;
        case 1: // RTL
            current_maneuver = ManeuverState::NONE;
            waypoints.clear();
            manual_speed_override = false;
            // Default return-to-launch coordinate (Konya test point).
            waypoints.push_back({37.8728, 32.4922});
            break;
        case 2: // AUTO_PATROL
            current_maneuver = ManeuverState::NONE;
            manual_speed_override = false;
            break;
        case 3: // STOP
            current_maneuver = ManeuverState::NONE;
            waypoints.clear();
            manual_speed_override = false;
            break;
        // Additional command IDs can be added here.
    }
}

PlaintextTelemetry TelemetrySensor::create_telemetry_tick(uint32_t interval_ms) {
    PlaintextTelemetry pkt{};
    pkt.altitude = current_altitude;
    
    float target_speed = current_speed; // Default target is the cruising speed

    if (current_maneuver != ManeuverState::NONE) {
        pkt.flight_mode = static_cast<uint8_t>(FlightMode::AUTONOMOUS);
        
        double speed_mps = (actual_speed * 1000.0) / 3600.0; // m/s
        if (speed_mps < 1.0) speed_mps = 1.0; 
        
        // 500-meter maneuver radius.
        double R_meters = 500.0;
        double R_deg_lat = R_meters / DEGREE_TO_METER;
        double R_deg_lon = R_meters / (DEGREE_TO_METER * std::cos(maneuver_center_lat * M_PI / 180.0));
        
        // Angular velocity (radians per second).
        double angular_velocity = speed_mps / R_meters;
        
        double ideal_lat = current_lat;
        double ideal_lon = current_lon;

        if (current_maneuver == ManeuverState::ORBIT_TARGET) {
            ideal_lat = maneuver_center_lat + R_deg_lat * std::sin(time_counter);
            ideal_lon = maneuver_center_lon + R_deg_lon * std::cos(time_counter);
        } else if (current_maneuver == ManeuverState::FIGURE_8) {
            double den = 1.0 + std::sin(time_counter) * std::sin(time_counter);
            ideal_lat = maneuver_center_lat + (R_deg_lat * std::cos(time_counter)) / den;
            ideal_lon = maneuver_center_lon + (R_deg_lon * std::sin(time_counter) * std::cos(time_counter)) / den;
        } else if (current_maneuver == ManeuverState::EVASIVE_MANEUVER) {
            // Lissajous-style evasive movement profile.
            ideal_lat = maneuver_center_lat + (R_deg_lat * 1.5) * std::sin(1.3 * time_counter + std::sin(0.7 * time_counter));
            ideal_lon = maneuver_center_lon + (R_deg_lon * 1.5) * std::cos(0.8 * time_counter + std::sin(1.1 * time_counter));
        }

        double dLat = ideal_lat - current_lat;
        double dLon = ideal_lon - current_lon;
        
        double dy_meters = dLat * DEGREE_TO_METER;
        double dx_meters = dLon * (DEGREE_TO_METER * std::cos(current_lat * M_PI / 180.0));
        double dist_m = std::sqrt(dx_meters*dx_meters + dy_meters*dy_meters);
        
        double move_m = speed_mps * (interval_ms / 1000.0);
        
        // Rabbit-chasing controller:
        // adapt phase progression based on UAV-to-target distance.
        double advance_factor = 1.0;
        if (dist_m > 150.0) {
            advance_factor = 0.0; // Hold target progression when UAV is too far.
        } else if (dist_m < 50.0) {
            advance_factor = 1.5; // Increase progression when UAV is close.
        } else {
            advance_factor = 1.0;
        }
        
        // Advance target phase.
        time_counter += angular_velocity * (interval_ms / 1000.0) * advance_factor;

        // Move UAV toward target respecting speed limits.
        if (dist_m > 0.1) {
            if (move_m > dist_m) move_m = dist_m;
            heading_rad = std::atan2(dy_meters, dx_meters);
            current_lat += (dy_meters / dist_m * move_m) / DEGREE_TO_METER;
            current_lon += (dx_meters / dist_m * move_m) / (DEGREE_TO_METER * std::cos(current_lat * M_PI / 180.0));
        }
    } else if (!waypoints.empty()) {
        pkt.flight_mode = static_cast<uint8_t>(FlightMode::AUTONOMOUS);
        TargetPoint& tgt = waypoints.front();
        double dLat = tgt.lat - current_lat;
        double dLon = tgt.lon - current_lon;
        double dist = std::sqrt(dLat*dLat + dLon*dLon);

        if (dist > 0.0001) {
            double dy_meters = dLat * DEGREE_TO_METER;
            double dx_meters = dLon * (DEGREE_TO_METER * std::cos(current_lat * M_PI / 180.0));
            heading_rad = std::atan2(dy_meters, dx_meters);
            // Apply actual_speed for movement
            double move_deg = (actual_speed * (interval_ms / 1000.0)) / DEGREE_TO_METER;
            if (move_deg > dist) move_deg = dist;
            current_lat += (dLat / dist) * move_deg;
            current_lon += (dLon / dist) * move_deg;
        } else {
            waypoints.erase(waypoints.begin()); // Remove completed waypoint.
        }
    } else {
        pkt.flight_mode = static_cast<uint8_t>(FlightMode::MANUAL);
        if (manual_speed_override) {
            // On manual speed override, continue movement along current heading.
            target_speed = current_speed;
            double speed_mps = (actual_speed * 1000.0) / 3600.0;
            double move_m = speed_mps * (interval_ms / 1000.0);
            double dy_meters = std::sin(heading_rad) * move_m;
            double dx_meters = std::cos(heading_rad) * move_m;
            current_lat += dy_meters / DEGREE_TO_METER;
            current_lon += dx_meters / (DEGREE_TO_METER * std::cos(current_lat * M_PI / 180.0));
        } else {
            // No active target or mission: transition to hover-like state.
            target_speed = 0.0f;
        }
    }

    // Realistic acceleration / deceleration (e.g. +/- 10 km/h per second)
    float accel_step = 10.0f * (interval_ms / 1000.0f); 
    if (actual_speed < target_speed) {
        actual_speed += accel_step;
        if (actual_speed > target_speed) actual_speed = target_speed;
    } else if (actual_speed > target_speed) {
        actual_speed -= accel_step;
        if (actual_speed < target_speed) actual_speed = target_speed;
    }

    pkt.speed = actual_speed;

    pkt.latitude = static_cast<int32_t>(current_lat * GPS_SCALE);
    pkt.longitude = static_cast<int32_t>(current_lon * GPS_SCALE);
    
    battery -= 0.6f; if(battery < 0.0f) battery = 0.0f;
    pkt.battery = battery;
    
    pkt.seq_num = current_seq++;
    pkt.timestamp = get_time_ms();
    pkt.priority = (battery <= 20.0f) ? 1 : 0;
    return pkt;
}
