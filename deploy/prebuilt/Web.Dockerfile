ARG BASE
FROM ${BASE}
COPY *.js /usr/share/nginx/html/
COPY app.css /usr/share/nginx/html/app.css
COPY index.html /usr/share/nginx/html/index.html
COPY assets/apple-signin.png /usr/share/nginx/html/assets/apple-signin.png
