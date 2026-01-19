FROM nginx:alpine

WORKDIR /usr/share/nginx/html

# Drop the default nginx welcome page; recreate the path as a symlink placeholder
# so bind-mounts from docker-compose can overwrite it cleanly at runtime.
RUN rm /usr/share/nginx/html/index.html && ln -s /usr/share/nginx/html/index.html /usr/share/nginx/html/index.html

# Provide a custom entrypoint (used to inject env vars into static assets).
COPY docker-entrypoint.sh /
RUN chmod +x /docker-entrypoint.sh

# Copy the built static files and configuration into the image.
COPY . .

# Start via the custom entrypoint, then launch nginx in foreground.
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
