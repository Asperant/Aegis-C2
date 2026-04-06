cmake_minimum_required(VERSION 3.14)
project(Aegis_UAV_Client CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Find OpenSSL 3.x
find_package(OpenSSL REQUIRED)

# Definitions
add_compile_options(-Wall -Wextra -O2)

# Include directories
include_directories(include)

# Source files
set(SOURCES
    src/main.cpp
    src/CryptoEngine.cpp
    src/TelemetrySensor.cpp
    src/UdpTransceiver.cpp
)

# Executable
add_executable(UAV_Client ${SOURCES})

# Linking
target_link_libraries(UAV_Client PRIVATE OpenSSL::SSL OpenSSL::Crypto)
