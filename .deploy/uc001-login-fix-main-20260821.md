# UC-001 login fix — main deployment trigger

This marker intentionally triggers the main-branch Web deployment pipeline after verification that `main` already contains the corrected login flow:

- `POST /security/v1/auth/login` is the only authentication request.
- Web consumes Security's returned `isSuperAdmin` classification.
- Web does not present the human authentication JWT to the Platform Admin token boundary.

Triggered during UC-001 runtime login investigation on 21-Aug-2026.
