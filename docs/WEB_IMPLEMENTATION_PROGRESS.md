# Verigence V1 — Web Implementation Progress

**Scope lock:** Until Web sign-off, implementation changes are restricted to `verigence/verigence-web`.  
**Backend repositories:** Read-only for contract discovery. No Audit Core, Security, DI, database or infrastructure changes are permitted during this phase.  
**Updated:** 2026-08-17

## Status legend

- **DONE** — screen/flow implemented in Web.
- **CORE** — Web client is wired to an existing Audit Core endpoint/action.
- **WEB DEMO** — isolated Web-only working adapter/data is used because the required aggregate/backend capability is not available yet.
- **HYBRID** — existing Core contracts are used for authoritative detail while Web supplies an aggregate/read-model projection.
- **BACKEND LATER** — production persistence/auth/aggregate capability is intentionally deferred until after Web sign-off.

## Screen and integration tracker

| Area | Web screen / flow | Web | Backing today | Backend after Web? |
|---|---|---|---|---|
| Foundation | React/Vite/Ionic/Capacitor shell | DONE | Web | No |
| Foundation | Responsive role-aware navigation | DONE | Web | No |
| Foundation | Demo/Core runtime switch | DONE | Web | No |
| Foundation | Lazy route/code splitting | DONE | Web | No |
| Authentication | Sign-in | DONE | WEB DEMO | BACKEND LATER — Security auth bridge |
| Authentication | Sign-up / access request | DONE | WEB DEMO | BACKEND LATER — onboarding API |
| Authentication | Pending approval confirmation | DONE | WEB DEMO | BACKEND LATER |
| Administration | Access approval queue + role decision | DONE | WEB DEMO | BACKEND LATER — Security onboarding |
| PC/Shared | Role overview/dashboard | DONE | HYBRID | Aggregate read model later |
| PC/Shared | Customer search/list | DONE | CORE | No |
| PC/Shared | Journey list | DONE | CORE assembled client-side | Optional aggregate later |
| PC/Shared | Journey workspace | DONE | CORE | No |
| PC | Booking evidence view | DONE | CORE booking + evidence | No |
| PC | Commercials/discount view | DONE | CORE | No |
| PC/TL | Payment/finance stage view | DONE | CORE | No |
| PC/TL/PM | Payment verification tracker | DONE | WEB DEMO aggregate; CORE per journey | Aggregate endpoint later |
| PC | Insurance/trade-in view | DONE | CORE | No |
| PC | Vehicle/registration/delivery view | DONE | CORE | No |
| PC | Evidence upload/capture | DONE | CORE upload contract in Core mode | Authentication token later |
| Shared | Evidence register | DONE | WEB DEMO aggregate; CORE per journey | Aggregate endpoint later |
| Shared | Evidence detail / extracted facts | DONE | CORE | No |
| PC | Audit start/submit | DONE | CORE | Authentication token later |
| TL/PM | Review queue | DONE | WEB DEMO aggregate; CORE decision/detail | Queue projection later |
| TL/PM | Review decision | DONE | CORE | Authentication token later |
| Shared | Findings register | DONE | WEB DEMO aggregate; CORE per journey | Aggregate endpoint later |
| Shared | Tasks / My Work | DONE | CORE | Authentication token later |
| Operations | Daily operations runs | DONE | CORE | Authentication token later |
| Operations | Daily PC/TL activity tracker | DONE | WEB DEMO | BACKEND LATER — activity read/write model |
| Operations | PC daily notepad | DONE | WEB DEMO/local persistence | BACKEND LATER — notepad persistence |
| Operations | CRM workspace | DONE | WEB DEMO aggregate; CORE per journey | Aggregate queue later |
| Operations | Escalations | DONE | WEB DEMO aggregate; CORE per journey | Aggregate queue later |
| Insights | Analytics dashboard | DONE | WEB DEMO | BACKEND LATER — analytics/read model |
| Admin | Project / dealer / outlet hierarchy | DONE | CORE | No |
| Admin | Team & business-scope assignments | DONE | WEB DEMO | BACKEND LATER — public assignment contract |
| Admin | Dealership participant references | DONE | WEB DEMO | BACKEND LATER — participant master contract |
| Admin | Product catalogue | DONE | WEB DEMO | BACKEND LATER — public master lifecycle API |
| Admin | Price-list versions | DONE | WEB DEMO | BACKEND LATER — public master lifecycle API |
| Admin | Discount schemes | DONE | WEB DEMO | BACKEND LATER — public master lifecycle API |
| Admin | Supporting controls/document requirements | DONE | WEB DEMO | BACKEND LATER — configuration API |
| Shared | Profile / runtime/session context | DONE | Web | Security session later |

## Existing Audit Core contracts already integrated in Web

The Web integration layer maps the current public Audit Core routes for:

- Project
- Dealers and outlets
- Customers
- Journeys
- Booking
- Commercials
- Payments
- Finance
- Insurance
- Trade-in
- Vehicle
- Registration
- Delivery
- Evidence upload/read/refresh and extracted facts
- Findings
- Audit state/start/submit
- Review decisions
- Workflow tasks
- Daily operations
- CRM interactions
- Escalations

## Web-only gaps deliberately isolated

The following capabilities remain inside Web Preview until the backend phase begins:

- sign-up/pending approval/approval persistence;
- production sign-in/session/token acquisition;
- cross-journey review/evidence/findings/payment/CRM/escalation aggregate read models;
- analytics read model;
- Daily PC/TL Activity Tracker persistence;
- PC Daily Activity Notepad persistence;
- Project team/business-scope assignment administration;
- dealership participant master/reference administration;
- full product/price/discount/supporting-master lifecycle APIs.

None of these gaps is being solved by changing Audit Core/Security/DI during the Web phase.

## Audit UX rule

For operational audit users, Verigence does **not** ask users to re-key facts already present in documents, screenshots or source systems. Web screens present extracted/system facts with provenance and allow evidence capture, workflow decisions, findings, remarks and administrative configuration. Manual data entry is limited to information genuinely created by the workflow.

## Validation

- CI validates dependency installation, TypeScript and the Vite production build on every branch/PR update.
- The Web Preview is the review baseline until authentication and missing backend read models are activated after Web sign-off.

## Deferred until Web sign-off

Do not modify another Verigence module to close a Web dependency. Record it above, keep the Web contract/adapter isolated, and create the backend implementation plan only after the Web application is accepted.
