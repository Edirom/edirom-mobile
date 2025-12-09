FROM nginx:alpine

WORKDIR /usr/share/nginx/html
RUN rm /usr/share/nginx/html/index.html && ln -s /usr/share/nginx/html/index.html /usr/share/nginx/html/index.html

COPY docker-entrypoint.sh /
RUN chmod +x /docker-entrypoint.sh

COPY . .

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
