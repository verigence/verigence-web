# Verigence Web

Single-codebase frontend for Verigence **Audit • Governance • Intelligence**.

## V1 technology baseline

The frozen startup stack is:

- React
- TypeScript
- Vite
- Ionic React
- Capacitor
- React Router
- TanStack Query
- Zustand
- React Hook Form
- Zod

See [`docs/AGREED_TECHNOLOGY_STACK.md`](docs/AGREED_TECHNOLOGY_STACK.md) for the architecture decision and cost guardrails.

## Architecture rule

Browser and Capacitor clients call **Audit Core only**. Security/Clerk, DI and other backend capabilities remain behind Audit Core.

## Local development

```bash
cp .env.example .env
npm install
npm run dev
```

Production build:

```bash
npm run typecheck
npm run build
```

## Native bootstrap

Capacitor Android/iOS platform packages are kept in this repository, but native projects should be generated only when the Web baseline is healthy:

```bash
npx cap add android
npx cap add ios
npm run build
npm run cap:sync
```

Android/iOS store distribution is intentionally deferred; no managed mobile build service is required.

## Brand baseline

- Brand assets: `public/brand/`
- Brand guidelines: `docs/BRANDING_GUIDELINES.md`
- V1 stack decision: `docs/AGREED_TECHNOLOGY_STACK.md`
