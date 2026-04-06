FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Pass build arguments so Vite can bake the backend URLs into the frontend assets
ARG VITE_API_URL
ARG VITE_HUB_URL
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_HUB_URL=$VITE_HUB_URL

RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html

# Generate simple SPA configuration for React Router
RUN echo 'server { listen 80; location / { root /usr/share/nginx/html; index index.html; try_files $uri $uri/ /index.html; } }' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["/bin/sh", "-c", "echo \"window.env = { VITE_API_URL: '${VITE_API_URL}', VITE_HUB_URL: '${VITE_HUB_URL}' };\" > /usr/share/nginx/html/env-config.js && nginx -g 'daemon off;'"]
