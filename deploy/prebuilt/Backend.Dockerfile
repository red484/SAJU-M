ARG BASE
FROM ${BASE}
COPY coach-service.mjs /app/src/server/services/coach-service.mjs
COPY consultation-scope.js /app/src/client/consultation-scope.js
