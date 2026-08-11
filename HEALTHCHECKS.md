# Health Checks

The dynamic Ballot Clarity API exposes unauthenticated monitoring probes before
CORS, authentication, and rate-limiting middleware:

- `GET /healthz` returns `200 {"ok":true}`; `HEAD` returns `200` with no body.
- `GET /readyz` returns `200 {"ok":true}` when the administrative store is
  reachable and the configured coverage package is present.
- Dependency failure returns `503 {"ok":false}`. `HEAD /readyz` performs the
  same check and returns the same status with no body.
- `/health` remains a compatibility alias for readiness.

Every probe sends `Cache-Control: no-store`. Probes never redirect, set cookies,
authenticate, or expose secrets, database names, storage drivers, host details,
coverage paths, provider configuration, process metrics, environment
information, timestamps, or dependency diagnostics.
