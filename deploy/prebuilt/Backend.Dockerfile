ARG BASE
FROM ${BASE}
COPY src-server/ /app/src/server/
COPY src-shared/ /app/src/shared/
COPY server/ /app/server/
COPY consultation-scope.js /app/src/client/consultation-scope.js
