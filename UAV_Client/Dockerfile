# ============================================
# Stage 1: Build environment
# ============================================
FROM alpine:3.18 AS build

RUN apk add --no-cache build-base cmake openssl-dev

WORKDIR /app
COPY . .

RUN cmake -B build -S . && cmake --build build

# ============================================
# Stage 2: Runtime image
# ============================================
FROM alpine:3.18

RUN apk add --no-cache libstdc++ openssl libgcc

COPY --from=build /app/build/UAV_Client /usr/local/bin/uav_client

CMD ["uav_client"]
