# Verigence Web — Build and Deployment Process

**Repository:** `verigence/verigence-web`  
**Target environment:** DEV  
**Deployment branch:** `main`  
**Workflow:** `.github/workflows/deploy-uc001-dev.yml`  
**Recorded:** 20-Aug-2026

## 1. Purpose

This note records the working build/deployment path for Verigence Web so that future UC work can be promoted and diagnosed without rediscovering the deployment flow.

The key operational rule is:

> Functional work may be developed on a planning/feature branch, but the Cloudflare DEV deployment is triggered from `main`.

Do not replace newer `main`-line auth, branding, proxy, or deployment changes by merging an older planning branch wholesale. Promote only the intended functional delta onto the current `main` when the branches have diverged.

## 2. Promotion flow

1. Complete and verify the intended functional changes on the working branch.
2. Compare the working branch against current `main`.
3. Preserve newer `main`-only infrastructure/auth/branding changes.
4. Apply only the required functional delta to current `main`.
5. Commit to `main` with a clear UC-specific commit message.
6. Observe the GitHub Action triggered by the `main` push.
7. Treat build success and deployment success as separate gates.
8. If deployment succeeds, verify the deployed public Web routes and Security proxy smoke tests.

## 3. GitHub Actions trigger

The DEV workflow is configured to run on:

- push to `main`
- manual `workflow_dispatch`

The workflow uses a concurrency group so a newer DEV deployment can cancel an older in-progress deployment.

## 4. Build and deployment stages

The current workflow performs the following stages in order.

### 4.1 Checkout

Checks out the exact `main` commit that triggered the workflow.

Always confirm the workflow log shows the expected source SHA before interpreting later results.

### 4.2 Identify deployment

Logs:

- Git commit SHA
- Security DEV upstream

Current Security DEV upstream:

`https://security-dev.up.railway.app`

### 4.3 Node setup

Uses Node.js 22.

### 4.4 Dependency installation

Runs:

```bash
npm install --no-audit --no-fund
```

### 4.5 Security DEV health validation

Before building the Web application, the workflow checks:

```text
https://security-dev.up.railway.app/health/live
```

The deployment should not continue if the Security DEV upstream is unavailable.

### 4.6 Approved Verigence logo verification

The workflow reconstructs the approved PNG lockup from the bundled source parts and verifies its exact SHA-256 digest and PNG size/signature.

This protects the frozen/approved Verigence brand asset from accidental replacement.

### 4.7 Typecheck and production build

Runs:

```bash
npm run build
```

The package build performs TypeScript checking followed by the Vite production build.

Build-time configuration includes:

```text
VITE_SECURITY_BASE_URL=""
VITE_AUDIT_CORE_BASE_URL=${{ secrets.AUDIT_CORE_URL }}
```

An empty `VITE_SECURITY_BASE_URL` is intentional in DEV: browser Security requests use same-origin `/security/*` paths and the Cloudflare Worker proxies them to Security DEV.

### 4.8 Verify approved logo is bundled

The generated `dist/assets` output is checked to confirm the approved embedded PNG lockup is present in the production bundle.

### 4.9 Deploy to Cloudflare DEV

Deployment uses:

```text
cloudflare/wrangler-action@v3
```

with Wrangler command:

```bash
wrangler deploy
```

Required GitHub Actions secrets for this stage are:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The API token must be available to the workflow as the `CLOUDFLARE_API_TOKEN` environment variable provided by the Wrangler action. Never put the credential value in source control or documentation.

### 4.10 Deployed smoke test

After a successful Cloudflare deploy, the workflow checks the DEV Web endpoint and verifies that requests to the Security login route pass through the Web Worker proxy.

Current DEV Web endpoint:

`https://verigence-web-dev.jbrconsulting-it.workers.dev`

The Security proxy is expected to add the Verigence proxy response header and forward `/security/*` calls to Security DEV.

## 5. How to read a failed deployment

Separate failures into these categories:

### Build failure

Failure before the Cloudflare deploy step. Investigate TypeScript, Vite, dependency, asset, or upstream validation errors.

### Deployment credential/configuration failure

Build passes, but Wrangler fails before publishing. This is an environment/CI configuration problem, not an application build problem.

### Smoke-test failure

Cloudflare deployment completes, but the deployed application or Security proxy does not behave as expected. Investigate Worker routing, deployed asset contents, public routes, or Security upstream behaviour.

## 6. Observed reference run — 20-Aug-2026

UC-001 functional changes were promoted to `main` in commit:

`4c9b01c4808beb9c7c0e089287d9315b24a7d5e2`

Commit message:

`feat(uc-001): promote password recovery and legal pages to main`

GitHub Actions run:

- run number: `85`
- run id: `32389379162`
- source SHA: `4c9b01c4808beb9c7c0e089287d9315b24a7d5e2`
- result: **failure**

Observed stage results:

- checkout: PASS
- Security DEV health: PASS
- approved logo source verification: PASS
- TypeScript/typecheck: PASS
- Vite production build: PASS
- approved logo bundle verification: PASS
- Cloudflare deploy: FAIL
- deployed smoke test: SKIPPED

The Wrangler failure was explicit:

> In a non-interactive environment, it is necessary to set a `CLOUDFLARE_API_TOKEN` environment variable for Wrangler to work.

Therefore this reference run proves that the promoted UC-001 application code built successfully. The blocking issue at that point was Cloudflare deployment credential availability in GitHub Actions, not the Web application build.

GitHub Actions recorded the result in:

`docs/deploy-evidence/WEB_DEV_LATEST.md`

## 7. Recovery checklist for Cloudflare deployment failure

If the build passes but the Cloudflare step reports a missing API token:

1. Check repository/organization Actions secrets for `CLOUDFLARE_API_TOKEN`.
2. Check `CLOUDFLARE_ACCOUNT_ID` at the same scope.
3. Confirm the workflow is allowed to access those secrets from `main`.
4. Confirm the secret names exactly match the workflow references.
5. Do not print, copy, or commit secret values while diagnosing.
6. Re-run the failed workflow only after secret availability is corrected.
7. Verify the Cloudflare deploy stage passes.
8. Verify the deployed smoke-test stage then runs and passes.

## 8. Source-of-truth files

Use these files when diagnosing the DEV pipeline:

- `.github/workflows/deploy-uc001-dev.yml` — GitHub Actions build/deploy procedure
- `wrangler.jsonc` — Cloudflare Worker/static-assets configuration and Security upstream binding
- `worker/index.js` — same-origin `/security/*` reverse proxy behaviour
- `docs/deploy-evidence/WEB_DEV_LATEST.md` — latest workflow result recorded by GitHub Actions
- this document — operational handoff and diagnostic sequence

## 9. Definition of a successful DEV deployment

A change is considered successfully deployed to DEV only when all of the following are true:

1. intended commit is on `main`
2. Security DEV health validation passes
3. TypeScript/typecheck passes
4. Vite production build passes
5. approved branding checks pass
6. Cloudflare Wrangler deploy passes
7. deployed Web smoke test passes
8. Security same-origin proxy smoke test passes

A green local/build result alone is not deployment proof; Cloudflare publication and post-deploy smoke tests must also pass.
