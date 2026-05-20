FROM nginx:alpine
# Baked-in config so Dokploy rebuild always picks up changes (volume mounts can stay stale).
COPY nginx.conf /etc/nginx/nginx.conf
RUN nginx -t
