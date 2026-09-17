# Verigence App Distribution Portal

`/apps` is the authenticated Verigence-owned distribution page for the Android application.

## Access model

- Any authenticated Verigence human user may open `/apps`.
- No role, project, workspace, dealer, outlet, or operating-persona authorization is required.
- Unauthenticated users are sent to `/login?returnTo=/apps` and returned to the portal after a successful sign-in.
- APK bytes are served through `/app-distribution/latest`, which validates the bearer token with Verigence Security before streaming the configured release.

## Cloudflare Worker release configuration

The Worker reads these environment variables. `ANDROID_APK_URL` should point to the approved APK object in the chosen object store (Cloudflare R2 is the preferred long-term location).

| Variable | Purpose |
| --- | --- |
| `ANDROID_APK_URL` | HTTPS URL of the approved signed APK object |
| `ANDROID_APP_VERSION` | Human-readable app version |
| `ANDROID_APP_BUILD` | Build number / CI build identifier |
| `ANDROID_APP_SIZE` | Display size, e.g. `52 MB` |
| `ANDROID_APP_SHA256` | Published SHA-256 checksum |
| `ANDROID_MIN_ANDROID` | Display requirement, e.g. `Android 8+` |
| `ANDROID_APP_RELEASED_AT` | ISO timestamp or display date |

If `ANDROID_APK_URL` is not configured, `/apps` remains available to authenticated users but shows the release as **Not published** and disables the download button.

## Release publication checklist

1. Build the Android release from the approved `dev` revision.
2. Sign with the persistent Verigence release signing identity.
3. Verify Android signature and APK ZIP integrity.
4. Calculate SHA-256.
5. Upload the APK to the approved object store.
6. Update the Worker release variables above.
7. Smoke-test `/apps` with a normal authenticated user (not just an administrator).
8. Download from the portal and install on a test Android device before announcing the release.

## Installation guidance

The page includes a concise four-step install guide and a video walkthrough. The default video can be replaced with `VITE_ANDROID_INSTALL_VIDEO_URL` at build time if Verigence later hosts its own instructional video.
