# Verigence Mobile UI Foundation

## Baseline

The pre-mobile Web UI is preserved on branch:

- `baseline/web-ui-pre-mobile-2026-08-22`
- baseline commit: `0e77a9a5c3df96560650b22153c625f677cfbc61`

Active development is performed on `dev`. `main` is the stable integration branch and no longer deploys automatically to the Cloudflare DEV environment.

## Deployment model

- `dev` push -> Web CI -> Cloudflare DEV deployment.
- deployment evidence is written back to `dev` with `[skip ci]`.
- `main` push -> Web CI only.
- changes should be promoted from `dev` to `main` after verification.

## Mobile strategy

Verigence uses one React/Ionic UI codebase for Web, Android and iOS. Capacitor packages the same Vite production build; a separate mobile React application should not be created.

The application must adapt its presentation by available screen size while reusing the same routes, business rules, API clients and state.

### Target presentation ranges

- Desktop: `>= 1180px`
- Tablet: `768px - 1179px`
- Mobile: `< 768px`
- Phone polish checkpoints: `430px`, `390px`, `360px`

These are presentation guidelines rather than device detection rules.

## Shared mobile behavior

`src/styles/mobile-foundation.css` is the shared adaptive layer loaded after the authenticated theme and user-facing UI guardrails.

The mobile foundation provides:

- an off-canvas navigation drawer instead of the desktop sidebar;
- a compact mobile top bar with Verigence branding;
- safe-area padding for Capacitor/iOS devices;
- minimum touch targets for primary interactive controls;
- 16px form controls on phones to avoid iOS focus zoom;
- single-column layout fallbacks for shared grids and forms;
- touch-friendly horizontal overflow for unavoidable data tables;
- mobile scrolling behavior for Project Administration steps;
- responsive logo sizing without inline fixed widths.

## UI completion rule

A new Verigence screen is not considered UI-complete until its desktop, tablet and mobile behavior has been checked.

Mobile should not be treated as a shrunken desktop page. Dense desktop structures should adapt where appropriate:

- tables -> mobile list/card presentation for high-frequency operational workflows;
- multi-column forms -> single-column forms;
- sidebar navigation -> drawer or mobile navigation;
- master/detail screens -> one pane at a time with a clear Back action;
- multi-step processes -> compact step progress rather than forcing the full desktop stepper onto a phone.

## Capacitor readiness

The repository already contains Capacitor configuration and Android/iOS dependencies. Native shells can be added when the core journeys are sufficiently mature. Before app-store readiness, explicitly test authentication/deep links, device Back behavior, safe areas, keyboard behavior, camera/location permissions, file handling, app resume/session expiry and intermittent connectivity.
