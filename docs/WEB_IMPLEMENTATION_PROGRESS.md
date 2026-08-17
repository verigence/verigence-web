# Verigence V1 — Web Implementation Progress

**Scope lock:** Until Web sign-off, implementation changes are restricted to `verigence/verigence-web`.  
**Backend repositories:** Read-only for contract discovery. No Audit Core, Security, DI, database or infrastructure changes are permitted during this phase.  
**Updated:** 2026-08-17

## Status legend

- **DONE** — screen/flow implemented in Web and build validated.
- **CORE** — Web client is wired to an existing Audit Core endpoint.
- **WEB DEMO** — Web-only working adapter/data used because the required aggregate/backend capability does not yet exist.
- **BLOCKED-BACKEND** — UX can be completed, but production activation requires a later backend capability.

## Screen and integration tracker

| Area | Web screen / flow | Web status | Data / action backing | Backend follow-up later |
|---|---|---|---|---|
| Foundation | React/Vite/Ionic/Capacitor shell | DONE | Web | No |
| Foundation | Role-aware responsive navigation | IN PROGRESS | Web | No |
| Foundation | Demo/Core runtime switch | DONE | Web | No |
| Authentication | Sign-up / access request | DONE | WEB DEMO; Core contract reserved | Yes — onboarding API |
| Authentication | Pending approval confirmation | DONE | WEB DEMO | Yes |
| Authentication | Approval queue + approve/reject | DONE | WEB DEMO; Core contract reserved | Yes — onboarding API |
| Authentication | Sign-in screen | PLANNED | WEB DEMO initially | Yes — auth bridge |
| PC | Dashboard | PLANNED | Hybrid aggregate | Aggregate API optional |
| PC | Customer search/list | PLANNED | CORE (`/outlets/{outlet}/customers`) | No |
| PC | Journey list | PLANNED | CORE via customer journeys | Cross-customer list optional |
| PC | Journey workspace | PLANNED | CORE | No |
| PC | Booking evidence view | PLANNED | CORE booking + evidence | No |
| PC | Commercials/discount view | PLANNED | CORE | No |
| PC | Payments/finance view | PLANNED | CORE | No |
| PC | Insurance/trade-in view | PLANNED | CORE | No |
| PC | Vehicle/registration/delivery view | PLANNED | CORE | No |
| PC | Evidence upload/capture | FOUNDATION DONE | CORE upload contract | Auth token needed |
| PC | Audit start/submit | PLANNED | CORE | No |
| TL | Review queue | PLANNED | WEB DEMO aggregate + CORE journey review | Queue projection later |
| TL | Evidence comparison | PLANNED | CORE evidence facts | No |
| TL | Review decision | PLANNED | CORE | No |
| PM | PM review / disposition | PLANNED | CORE | No |
| Shared | Findings register | PLANNED | WEB DEMO aggregate + CORE per journey | Aggregate endpoint optional |
| Shared | Tasks / work queue | PLANNED | CORE | No |
| Shared | Evidence register | PLANNED | WEB DEMO aggregate + CORE per journey | Aggregate endpoint optional |
| Operations | Daily operations | PLANNED | CORE | No |
| Operations | CRM workspace | PLANNED | WEB DEMO aggregate + CORE per journey | Aggregate endpoint optional |
| Operations | Escalations | PLANNED | WEB DEMO aggregate + CORE per journey | Aggregate endpoint optional |
| Insights | Analytics dashboard | PLANNED | WEB DEMO aggregate | Yes — analytics API later |
| Admin | Project / dealer / outlet configuration | PLANNED | CORE | No |
| Admin | Access administration | DONE baseline | WEB DEMO | Yes — Security onboarding |
| Shared | Profile / session | PLANNED | Web | Auth later |

## Audit UX rule

For operational audit users, Verigence does **not** ask the user to re-key facts already present in documents, screenshots or source systems. Web screens should present extracted/system facts with provenance and allow evidence capture, workflow decisions, findings and review actions. Manual data entry is limited to genuine new workflow information such as remarks, findings, decisions or administrative configuration.

## Audit Core routes already mapped for Web

The Web integration layer includes existing Core contracts for project, dealers/outlets, customers, journeys, booking, commercials, payments, finance, insurance, trade-in, vehicle, registration, delivery, evidence upload/read/refresh, findings, audit state/submission, review decisions, tasks, daily operations, CRM interactions and escalations.

## Deferred until Web sign-off

Do not modify other modules to close any gap during Web implementation. Record the gap here, use a clearly isolated Web demo adapter where required, and only after Web sign-off create the backend implementation plan.
