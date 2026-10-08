# The site is static files: a non-root nginx serves them on 8080. infra/deploy.ps1 builds and pushes this image.
FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY infra/nginx.conf /etc/nginx/conf.d/default.conf
COPY --chown=nginx:nginx index.html LICENSE /usr/share/nginx/html/
COPY --chown=nginx:nginx assets /usr/share/nginx/html/assets
COPY --chown=nginx:nginx atlas /usr/share/nginx/html/atlas
EXPOSE 8080
