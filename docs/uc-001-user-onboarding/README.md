# UC-001 — User Onboarding Design Pack

**Status:** DRAFT FOR DESIGN REVIEW  
**Date:** 2026-08-19  
**Repository:** `verigence/verigence-web`  
**Branch:** `planning/uc-001-user-onboarding`

## Purpose

This folder is the clean source of truth for UC-001 User Onboarding. It replaces the old Web onboarding assumptions for design purposes without deleting historical files.

No application implementation is authorized by these documents until the design approval record is completed.

## Authoritative inputs

1. `verigence-security/dev/docs/SECURITY_SOLUTION_DESIGN_v2.0.md` — 19-Aug-2026.
2. `verigence-security/dev/docs/SECURITY_IMPLEMENTATION_DESIGN_v2.0.md` — 19-Aug-2026.
3. `verigence-web/planning/uc-001-user-onboarding/docs/BRANDING_GUIDELINES.md`.
4. `verigence-web/planning/uc-001-user-onboarding/docs/SESSION_HANDOFF.md` for working method and branch discipline.

Where older Web authentication/onboarding notes conflict with the two 19-Aug Security v2 documents, Security v2 wins.

## Frozen UC-001 architecture

```text
Web browser / Capacitor mobile
              |
              | Verigence Security APIs
              v
        Verigence Security
              |
              | Clerk Backend API only
              v
             Clerk
```

- Clerk is the human credential provider.
- Only Security integrates with Clerk.
- Web/Mobile contain no Clerk SDK, Clerk keys or Clerk session-JWT authentication.
- Security owns the global Verigence USER, onboarding lifecycle and Verigence-facing authentication boundary.
- Security issues the Verigence human JWT after successful login.
- Functional authorization remains live in Security.

## Web and mobile delivery model

UC-001 is one product flow delivered from the same React + TypeScript + Vite + Ionic React application.

- Browser: responsive Web application.
- Android/iOS: the same application wrapped by Capacitor.
- Business rules, form schema, API client and state transitions are shared.
- Responsive layout may change presentation, not meaning or flow.
- No separate React Native/mobile onboarding implementation is planned.

## Deliverables

1. [`01-use-case-spec.md`](./01-use-case-spec.md)
2. [`02-sequence-diagram.md`](./02-sequence-diagram.md)
3. [`03-wireframes/README.md`](./03-wireframes/README.md)
4. [`04-api-data-mapping.md`](./04-api-data-mapping.md)
5. [`05-test-scenarios.md`](./05-test-scenarios.md)
6. [`06-design-approval.md`](./06-design-approval.md)

## Change-control rules

- Do not modify Security, Audit Core, DI or Web `main` while this pack is under design review.
- Do not implement UC-001 until the design is explicitly approved.
- Do not invent APIs, fields, roles, lifecycle states, Clerk flows, persistence, Device/Geo rules or authorization rules.
- Anything not defined by the current Web files or 19-Aug Security v2 source of truth is marked **OPEN DECISION**.

## Historical Web files

The following existing files remain in the branch for history/reference but are not authoritative for UC-001 where they conflict with this pack:

- `docs/USER_ONBOARDING_FLOW.md`
- `docs/APPROVAL_FLOW.md`
- onboarding sections of `docs/AGREED_TECHNOLOGY_STACK.md`
- onboarding sections of `docs/WEB_IMPLEMENTATION_PROGRESS.md`
- current prototype signup/approval source files

They should be reconciled only after this design pack is approved.