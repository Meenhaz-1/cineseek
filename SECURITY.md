# Security policy

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Use GitHub's
private vulnerability reporting feature for this repository and include the
affected route, reproduction steps, impact, and any suggested mitigation.

You can expect an acknowledgement within five business days. Please allow time
for validation and a coordinated fix before public disclosure.

## Supported version

Security fixes target the latest commit on the default branch. CineSeek is a
local product build, not a hosted service, and currently has no production
availability commitment.

## Current security boundary

- Secrets belong in `frontend/.env.local`; that file is ignored by Git.
- TMDB credentials are read only by server-side scripts.
- Benchmark mutation and AI endpoints are intended for trusted local use.
- Production authentication and role-based authorization are roadmap work and
  must be completed before exposing write-capable routes publicly.

See [docs/DATA.md](docs/DATA.md) for third-party data handling.
