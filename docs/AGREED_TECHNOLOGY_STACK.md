# Verigence V1 — Agreed Frontend Technology Stack

**Status:** Accepted / frozen for V1 startup phase  
**Decision date:** 2026-08-17  
**Repository:** `verigence/verigence-web`  
**Scope:** Web application plus shared mobile runtime  
**Decision owner:** Verigence product/engineering

## 1. Decision

For Verigence V1, the frontend will use a **zero-license, zero-managed-build-cost stack** and will not depend on Expo EAS, Ionic Appflow, or another paid frontend hosting/build platform.

The agreed baseline is:

> **React + TypeScript + Vite + Ionic React + Capacitor**

This is a **web-first, single-codebase architecture**. The same React application is delivered directly to browsers and wrapped by Capacitor for Android and iOS when native capabilities are required.

This document is the authoritative V1 frontend technology decision. Any earlier assumptions around Next.js, a separate React Native application, Expo/EAS, or managed mobile build services are superseded by this decision.

## 2. Stack

| Area | Choice | Startup cost intent |
|---|---|---:|
| Language | TypeScript | Free |
| UI framework | React | Free |
| Build tooling | Vite | Free |
| Cross-platform UI primitives | Ionic React | Free / open source |
| Native runtime | Capacitor | Free / open source |
| Routing | React Router | Free |
| API/server state | TanStack Query | Free |
| Local state | Zustand | Free |
| Forms | React Hook Form | Free |
| Validation | Zod | Free |
| Native camera | Capacitor Camera | Free |
| Geolocation | Capacitor Geolocation + browser geolocation | Free |
| Web hosting target | Cloudflare Pages Free | ₹0 target |
| CI/CD | GitHub Actions within included allowance | ₹0 target |
| Backend | Existing Verigence Audit Core / Railway services | Existing backend cost |

## 3. Why this architecture fits Verigence

Verigence is fundamentally an **enterprise web application that also needs mobile execution**.

The richer experiences are desktop/web oriented:

- Super Admin
- TL review queue
- PM review
- evidence comparison
- journey workspace
- data tables
- findings
- dashboards

Current native requirements are comparatively small:

- camera
- GPS/geolocation
- possible filesystem/device integrations later

Therefore the natural architecture is to build the enterprise experience as a React web application and add native capabilities through Capacitor, instead of building a React Native application and then forcing it to behave like a desktop web product.

```text
                    ONE REACT APPLICATION

                     React + Vite
                          │
               Ionic UI / Verigence UI
                          │
              ┌───────────┴───────────┐
              │                       │
              ▼                       ▼
             WEB                  CAPACITOR
                                      │
                                ┌─────┴─────┐
                                ▼           ▼
                             Android       iOS
```

## 4. Verigence owns the visual system

Ionic is an implementation primitive, **not the product identity**. The application must not look like a generic Ionic application.

The product-facing component layer remains Verigence-owned, for example:

- `VerigenceButton`
- `VerigenceInput`
- `EvidenceCard`
- `JourneyCard`
- `StatusChip`
- `ReviewQueue`
- `UploadPanel`
- `DocumentViewer`
- `FindingCard`

The approved brand baseline remains:

| Token | Value |
|---|---|
| Deep Blue | `#003A82` |
| Electric Blue | `#0057B8` |
| Teal | `#00AFA8` |
| Mint | `#00D3A7` |
| Mist | `#F4F8FB` |
| Slate | `#31506E` |
| Typeface | Inter |

See [`BRANDING_GUIDELINES.md`](./BRANDING_GUIDELINES.md) for the authoritative visual rules and checked-in assets.

## 5. Evidence-first product rule

Verigence is an audit and governance product. The frontend should not make the audit team re-key facts that already exist in source documents, screenshots, or system evidence.

The frontend should therefore prioritize:

1. capture/upload of source evidence;
2. presentation of extracted or system-derived facts;
3. comparison, review and exception handling;
4. explicit findings and decisions;
5. manual entry only where the business process genuinely creates new information.

This principle applies across Process Consultant, TL and PM experiences.

## 6. Web runtime

Vite produces static production assets. The deployment target for V1 is Cloudflare Pages Free.

```text
Browser
   │
   ▼
Cloudflare Pages
   │ HTTPS
   ▼
Audit Core
```

There is no dedicated frontend application server in the V1 design.

## 7. Backend boundary

Web and mobile clients know only **Audit Core**.

```text
Web / Capacitor Mobile
        │
        │ HTTPS
        ▼
     Audit Core
        │
        ├────────► Security ────────► Clerk
        │
        └────────► DI / other backend capabilities
```

The frontend must not call Clerk, Security, DI, databases, or object stores directly. Authentication, authorization, service-to-service delegation, document intelligence and downstream integrations stay behind Audit Core.

## 8. Mobile build strategy

No managed build service is required for V1.

Capacitor generates standard native projects:

```text
android/
ios/
```

Android uses the standard Android/Gradle toolchain. iOS uses the standard Xcode toolchain.

Target CI flow:

```text
GitHub
   │
   ▼
GitHub Actions
   │
   ├── typecheck
   ├── tests
   ├── vite build
   └── web deployment

Capacitor sync
   │
   ├── Android native build
   └── iOS native build
```

Ionic Appflow and Expo EAS are intentionally not part of the stack.

## 9. GitHub Actions cost guardrail

The intended CI/CD budget is **$0 beyond the included GitHub Actions allowance**.

Workflows should be efficient and use concurrency cancellation so obsolete branch builds do not consume unnecessary minutes. Repository billing should be configured so usage stops rather than incurring unintended overage.

## 10. Camera flow

The UI remains shared while the capability adapter differs by runtime.

```text
                    Evidence Capture

Web                                      Mobile
 │                                          │
 ├── Choose file                            ├── Take photo
 ├── Drag/drop                              ├── Retake
 │                                          └── Native permissions
 └──────────────────┬───────────────────────┘
                    │
                    ▼
              Evidence Service
                    │
                    ▼
                Audit Core
```

Browser file upload is the default web path. Native builds use the Capacitor Camera plugin through a small device abstraction so business logic stays shared.

## 11. GPS / location flow

```text
LocationService
      │
      ├── Web ─────► browser geolocation
      │
      └── Mobile ──► Capacitor Geolocation
```

Location is exposed through one frontend service contract. Product features should not contain platform-specific geolocation code.

## 12. Explicit V1 exclusions

Do **not** introduce these without a new architecture decision:

- Next.js
- Expo EAS
- Ionic Appflow
- Firebase
- Supabase
- Auth0
- Redux
- Nx
- Turborepo
- Storybook cloud services
- Sentry paid tier
- Datadog
- paid UI libraries
- paid maps SDK
- separate React Native repository/application

These products are not rejected in principle; they are simply unnecessary for the startup phase and would add cost, duplication or operational complexity.

## 13. Expected startup-phase frontend cost

```text
Frameworks             ₹0
UI libraries           ₹0
Native runtime         ₹0
Web hosting target     ₹0
Managed mobile build   ₹0
Frontend database      ₹0
Frontend auth service  ₹0
```

Verigence continues to pay only for backend infrastructure already selected for Audit Core, Security and DI, plus any usage-based backend services.

## 14. Later store-distribution costs

App-store registration/distribution fees are not part of the development technology stack. They should be incurred only when Verigence is ready to distribute native apps through Google Play and/or Apple channels.

## 15. Change control

The following are frozen for V1 unless this document is explicitly revised:

- React + TypeScript + Vite
- Ionic React for cross-platform UI primitives
- Capacitor for native runtime
- React Router
- TanStack Query
- Zustand
- React Hook Form
- Zod
- Cloudflare Pages as the zero-cost web-hosting target
- GitHub Actions with a zero-overage cost guardrail
- one codebase for browser, Android and iOS
- Audit Core as the only frontend backend boundary
- no managed mobile build service

Any proposal that changes one of these should state the problem being solved, incremental runtime/operational cost, migration impact and why the existing stack cannot satisfy the requirement.
