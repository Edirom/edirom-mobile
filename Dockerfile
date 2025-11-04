FROM nginx:alpine

WORKDIR /usr/share/nginx/html
RUN rm /usr/share/nginx/html/index.html && ln -s /usr/share/nginx/html/index.html /usr/share/nginx/html/index.html

COPY . .
