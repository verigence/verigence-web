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

## 10. UC-001 resume checkpoint — 20-Aug-2026 21:59 IST

This section is the immediate resume point for the current UC-001 Forgot Password / branding work. **Do not rediscover or redesign this work when resuming. Start here.**

### 10.1 Branches to resume from

**Web**

- repository: `verigence/verigence-web`
- resume/deployment branch: `main`
- current branch head at checkpoint: `fddbf587209f1dbc49860142180e6f2c7261eecc`
- the head is a GitHub Actions deployment-evidence commit; the functional UC-001 fixes are immediately before it
- do **not** switch back to `planning/uc-001-user-onboarding` for the fixes listed below; current `main` contains newer auth/branding/deployment work that must be preserved

**Security**

- repository: `verigence/verigence-security`
- source-of-truth / resume branch: `dev`
- current branch head at checkpoint: `3358e347fa3a53ac679a5e894d94d9440336305f`
- the head is a GitHub Actions deploy-evidence commit; the password-recovery functional fixes are already contained in this branch
- do **not** move this work to Security `main`; Security DEV work remains on `dev`

### 10.2 Web changes already completed and committed

The Forgot Password page and the two interim legal pages were using the old direct PNG import while Login already used the approved embedded lockup. The pages were changed to use the same approved embedded logo source as Login.

Functional Web commits:

- `66c5ce220ea94eb827dfbed989ca21c87398afdc` — `fix(auth): use embedded approved logo on password recovery`
- `7d842ad0b53f84ac660c17a36e9b83765a0a7250` — `fix(legal): use embedded approved logo`
- `1b64f61b747577628fbcf19f0452020df5740359` — `fix(legal): use embedded approved logo`

The following are already present on `main` and should not be rebuilt from scratch:

- Forgot Password UI and verification-code flow
- Terms of Use interim/general disclaimer page
- Privacy Policy interim/general disclaimer page
- approved Verigence logo on Forgot Password
- approved Verigence logo on Terms of Use
- approved Verigence logo on Privacy Policy

Latest Web validation run for the final logo commit:

- workflow run number: `89`
- workflow run id: `32390794871`
- source SHA: `1b64f61b747577628fbcf19f0452020df5740359`
- Security upstream health: PASS
- approved logo source verification: PASS
- TypeScript/typecheck: PASS
- Vite production build: PASS
- approved logo bundle verification: PASS
- Cloudflare deploy: FAIL
- deployed smoke tests: SKIPPED

The observed Cloudflare failure was still:

`CLOUDFLARE_API_TOKEN` was not available to Wrangler in the GitHub Actions runner.

Therefore the Web code/build is ready, but the final logo changes were **not proven published to DEV** at this checkpoint.

### 10.3 Security Forgot Password defect and completed fix

Observed browser error before the fix:

`Your users must have at least one verified email address. - This invariant is determined by your user settings`

Root cause:

The Clerk DEV configuration requires a user to retain at least one verified email address. The original password-recovery flow temporarily marked the registered email unverified before preparing a fresh email-code verification, which violated that Clerk invariant for users with only one verified address.

The Security fix now preserves the invariant by using an internal temporary verified recovery placeholder before the registered email is temporarily unverified. The placeholder is cleaned up on successful reset, cancellation/failure paths, and recovery self-healing.

Functional Security commits on `dev`:

- `72e60a8c6803a17678b6e0cbc8f6e30d4610422d` — `fix(password-recovery): preserve Clerk verified-email invariant`
- `7679531d28dc8673930483a6ddc1114f80296ce6` — `test(password-recovery): cover Clerk verified-email invariant`

Validation completed successfully before deployment:

- Python compile validation: PASS
- Ruff: PASS
- mypy: PASS
- password recovery unit tests: PASS
- migration `0023_password_recovery.sql`: PASS / already present

### 10.4 Security deployment status at checkpoint

Password Recovery DEV Deploy Proof workflow:

- run id: `32390682058`
- validation: PASS
- migration: PASS
- Railway service resolution: PASS
- previous successful Railway deployment id: `2e9d9412-da5d-4ccf-a7e2-4c7ce1a0d3fe`
- new deployment: NOT CREATED
- readiness validation of new code: NOT REACHED

Railway rejected the deployment submission with the platform message:

`Deploys have been paused due to an upstream issue`

The failed deployment was retried and Railway returned the same upstream-pause message again.

**Important:** the password-recovery invariant fix is committed and validated on `verigence-security/dev`, but it is **not yet proven live on Security DEV**. The currently running Security service may still be the previous deployment and therefore may still reproduce the Clerk verified-email error until a new Railway deployment succeeds.

### 10.5 Exact resume sequence

When work resumes, do the following in this order.

1. **Do not change the password-recovery code first.** The current fix is already committed and validated.
2. Open `verigence-security/dev` and confirm commits `72e60a8...` and `7679531...` are still ancestors of current `dev`.
3. Check whether Railway is accepting deployments again.
4. Re-run/dispatch the existing Password Recovery DEV deployment workflow from current `dev`.
5. Require the Railway deployment stage to create a new deployment and reach success.
6. Verify `https://security-dev.up.railway.app/health/ready` returns HTTP 200 after the new deployment.
7. Test Forgot Password against an eligible ACTIVE user: request verification code, confirm the previous Clerk verified-email invariant error no longer occurs, complete OTP verification, set a new password, and verify sign-in with the new password.
8. Then return to `verigence-web/main`. Do not reimplement the logo fixes.
9. Confirm `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are actually available to the Web deployment workflow without exposing their values.
10. Re-run/dispatch `.github/workflows/deploy-uc001-dev.yml` from current `main`.
11. Require Cloudflare deployment and post-deploy smoke tests to pass.
12. Browser-test `/forgot-password`, `/login`, `/terms`, and `/privacy` on DEV and confirm the approved logo is visible on all of them.
13. Only after the Security deployment and Web deployment are both green should this Forgot Password issue be considered closed.

### 10.6 Do-not-repeat notes

- Do not redesign Security for this issue; a concrete backend defect was identified and fixed.
- Do not revert to the older direct `verigence-lockup.png` import on Forgot Password, Terms, or Privacy. Use the embedded `verigenceLockup` source already used by Login.
- Do not interpret a successful Web build as a successful deployment; Cloudflare publication plus smoke tests are required.
- Do not interpret the presence of Security commits on `dev` as proof they are live; a successful Railway deployment and readiness test are required.
- Do not wholesale-merge the old Web planning branch over current `main`.
- Do not put Cloudflare, Railway, Clerk, or database secret values into source control, handoff documents, chat, or workflow logs.
