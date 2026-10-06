# Verigence App Distribution Portal

`/apps` is the authenticated Verigence-owned distribution page for the Android application.

## Access model

- Any authenticated Verigence human user may open `/apps`.
- No role, project, workspace, dealer, outlet, or operating-persona authorization is required.
- Unauthenticated users are sent to `/login?returnTo=/apps` and returned to the portal after a successful sign-in.
- APK bytes are served through `/app-distribution/latest` only after the existing Verigence bearer token is validated by Verigence Security.
- The APK is stored in a private Cloudflare R2 bucket and is never exposed through a public object-store URL.

## Storage model

Cloudflare R2 bucket: `verigence-app-releases`

Worker binding: `APP_RELEASES`

Objects:

- `android/latest.json` — metadata for the currently approved Android release.
- `android/releases/Verigence-<version>-<build>.apk` — immutable signed release APKs.

The Worker reads `android/latest.json`, retrieves the referenced APK through the private R2 binding, and streams it to the authenticated browser. If no metadata has been published, `/apps` remains available but displays **Not published** and disables the download button.

## Publishing a release

Use the GitHub Actions workflow **Publish Verigence Android App**.

It performs the complete release chain:

1. Builds native Web assets from the checked-out Verigence Web revision.
2. Generates/synchronizes the Capacitor Android project.
3. Reapplies and validates the approved Verigence launcher and splash branding.
4. Assigns the application version and a monotonically increasing CI build/version code.
5. Builds the release APK.
6. Restores the persistent Verigence signing key from GitHub Secrets.
7. Zipaligns and signs using Android v2/v3 signature schemes.
8. Verifies signatures, ZIP integrity, and launcher branding in the final signed APK.
9. Calculates SHA-256 and release size.
10. Creates `latest.json`.
11. Creates the private R2 bucket when it does not already exist.
12. Uploads the signed APK and then publishes `android/latest.json`.
13. Re-reads the metadata from R2 and verifies it byte-for-byte.
14. Retains the signed APK, metadata and signature-verification report as GitHub Actions evidence.

Required repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `ANDROID_RELEASE_KEYSTORE_BASE64`
- `ANDROID_RELEASE_STORE_PASSWORD`
- `ANDROID_RELEASE_KEY_PASSWORD`

The signing key itself must never be committed to the repository.

## Versions and changes

- The first release, **1.0.0** ("1.0"), was published on 05 October 2026. Every later release gets the next number and its notes in `CHANGELOG.md`.
- The app version is the `version` in `package.json`. The release workflow puts the same number in the APK (`versionName`); the build number (`versionCode`) is the GitHub run number. The APK file is `Verigence-<version>-<build>.apk`.
- The installed app reports its version to the server, so the login report and device diagnostics show it.
- Every change that reaches the app is written in `CHANGELOG.md` under **Unreleased**, in simple English, in the same commit as the change.
- To release: run `npm run release:version -- <new version>`, commit `package.json` and `CHANGELOG.md`, then run **Publish Verigence Android App**. The workflow stops early if that version has no notes, uses the notes as the release note in `latest.json`, and tags the released commit `android-v<version>-<build>` in Git.
- To see what a given APK contains: `git show android-v<version>-<build>` (or the `sourceSha` in its `latest.json`).

## Release metadata

`latest.json` contains the values displayed by `/apps`, including:

- version
- build/version code
- human-readable and byte size
- SHA-256 checksum
- minimum Android API
- release timestamp
- R2 object key
- Android package name (`com.verigence.app`)
- source Git SHA
- optional release notes

## Installation guidance

The page includes a concise four-step install guide, troubleshooting guidance, the official Android help link, and an embedded installation walkthrough. The video can be replaced with a Verigence-hosted video through `VITE_ANDROID_INSTALL_VIDEO_URL` without changing the portal component.
