ARG BASE
FROM ${BASE}
COPY src-server/ /app/src/server/
COPY server/ /app/server/
COPY consultation-scope.js /app/src/client/consultation-scope.js
