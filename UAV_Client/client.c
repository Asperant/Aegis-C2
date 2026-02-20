#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <arpa/inet.h>
#include <sys/socket.h>
#include <math.h>
#include <stdint.h>

#define SERVER_IP "172.18.0.3"
#define PORT 5000
#define GPS_SCALE 10000000.0

typedef enum{
    MODE_MANUAL = 0,
    MODE_AUTONOMUS = 1,
    MODE_RTL = 2
}FlightMode;

struct TelemetryPacket{
    unsigned char magic_byte;
    int32_t uav_id;
    int32_t latitude;
    int32_t longitude;
    float altitude;
    float speed;
    float battery;
    uint8_t flight_mode;
} __attribute__((packed));

int main(){
    int sockfd;
    struct sockaddr_in server_addr;
    struct TelemetryPacket packet;

    float angle = 0.0;
    float current_lat = 37.8715;
    float current_lon = 32.4930;

    if((sockfd = socket(AF_INET, SOCK_DGRAM, 0)) < 0){
        perror("Socket oluşturulamadı");
        exit(EXIT_FAILURE);
    }

    memset(&server_addr, 0, sizeof(server_addr));
    server_addr.sin_family = AF_INET;
    server_addr.sin_port = htons(PORT);
    server_addr.sin_addr.s_addr = inet_addr(SERVER_IP);

    printf("İHA Başlatıldı. Hedef: %s %d\n",SERVER_IP, PORT);

    packet.magic_byte = 0xFF;
    packet.uav_id = 101;
    packet.battery = 100.0;
    packet.flight_mode = MODE_AUTONOMUS;

    while(1){

        current_lat = 37.8715 + (sin(angle));
        current_lon = 32.4930 + (cos(angle));

        packet.latitude = (int32_t)(current_lat * GPS_SCALE);
        packet.longitude = (int32_t)(current_lon * GPS_SCALE);

        packet.altitude = 500 + (10 * sin(angle * 2));
        packet.speed = 80 + (rand() % 10);
        packet.battery -=  0.05;

        angle += 0.1;
        if(packet.battery < 0) packet.battery = 0;

        sendto(sockfd, &packet, sizeof(packet), 0, (const struct sockaddr*)&server_addr, sizeof(server_addr));

        printf("📤 Paket Gönderildi | Boyut: %lu byte | Gerçek GPS: %.4f, %.4f\n", 
               sizeof(packet), current_lat, current_lon);

        sleep(1);
    }

    close(sockfd);
    return 0;
}