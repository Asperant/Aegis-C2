#include <iostream>
#include <unistd.h>
#include <chrono>
#include <random>
#include "UdpTransceiver.hpp"
#include "TelemetrySensor.hpp"
#include "Logger.hpp"

uint64_t get_time_ms() {
    return std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now().time_since_epoch()).count();
}

int main() {
    std::random_device rd;
    std::mt19937 gen(rd());
    
    int my_uav_id = -1;
    double start_lat = 37.8000;
    double start_lon = 32.4000;
    
    // Check environment variables first
    bool coords_provided = false;
    if (const char* env_uav = std::getenv("UAV_ID")) {
        my_uav_id = std::atoi(env_uav);
    }
    if (const char* env_lat = std::getenv("UAV_LAT")) {
        start_lat = std::atof(env_lat);
        coords_provided = true;
    }
    if (const char* env_lon = std::getenv("UAV_LON")) {
        start_lon = std::atof(env_lon);
        coords_provided = true;
    }

    if (my_uav_id == -1) {
        std::uniform_int_distribution<> distr(1000, 9999);
        my_uav_id = distr(gen);
        
        if (!coords_provided) {
            std::uniform_real_distribution<> lat_distr(37.7500, 37.8500);
            std::uniform_real_distribution<> lon_distr(32.3500, 32.4500);
            start_lat = lat_distr(gen);
            start_lon = lon_distr(gen);
        }
    }

    UdpTransceiver link(my_uav_id);
    link.init_socket(PORT);

    Logger::info("UAV-" + std::to_string(my_uav_id) + " started in C++ client mode.");
    Logger::info("Initial coordinates: " + std::to_string(start_lat) + ", " + std::to_string(start_lon));

    TelemetrySensor sensor(start_lat, start_lon);
    
    uint64_t last_send_time = 0;

    // Endless mission loop
    while(true){
        if(!link.is_secure()){
            link.perform_handshake();
            if(!link.is_secure()) { usleep(1000000); continue; }
        }

        uint64_t current_time = get_time_ms();
        link.listen_for_acks();

        if (link.has_new_mission()) {
            sensor.set_waypoints(link.pop_mission());
        }
        
        while (link.has_tactical_command()) {
            sensor.apply_tactical_command(link.pop_tactical_command());
        }

        if(current_time - last_send_time >= link.get_send_interval()){
            PlaintextTelemetry pkt = sensor.create_telemetry_tick(link.get_send_interval());
            link.send_telemetry(pkt);
            last_send_time = current_time;
        }
        usleep(1000);
    }
    return 0;
}
