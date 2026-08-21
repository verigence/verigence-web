# UC-001 SuperAdmin login fix deployment marker

Triggers a clean Cloudflare DEV deployment after the Web login flow was corrected to use the `isSuperAdmin` classification returned by Security `/security/v1/auth/login` instead of presenting the human login token to the Platform Admin token boundary.
