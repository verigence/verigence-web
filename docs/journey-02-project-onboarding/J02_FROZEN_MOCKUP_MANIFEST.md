# Journey 02 — Frozen Mockup Manifest

**Status:** APPROVED / FROZEN  
**Date:** 21-Aug-2026  
**Branch:** `planning/uc-002-project-onboarding`

This manifest identifies the exact approved Journey-02 mockup set generated and reviewed in the 21-Aug-2026 design session. The functional/visual rules are frozen in `J02_FROZEN_UI_BASELINE.md`.

## Approved screen set

| Step | Screen | Approved artifact filename | SHA-256 of approved PNG |
|---|---|---|---|
| 01 | Create Project | `01-create-project.png` | `a98cc786509850cb43483a208ca2b70951859a96e47ebecb50e6884d3239ec51` |
| 02 | Dealers | `02-dealers.png` | `9dda9b0f260bfb228a897d88e639fccb3ef030d0ce4ba1e4da5c41017fc8c6b5` |
| 03 | Dealer Outlets | `03-dealer-outlets.png` | `07b1d32327b9a7f9dd29703722fcb065c8b30dc076432495bd201a7520e03608` |
| 04 | Employees | `04-employees.png` | `595f72730827a16ae60ce33e732c62ba344b026b6fbe2371d49fcac319eccf57` |
| 05 | Role Mapping | `05-role-mapping.png` | `c3e6d3e7e827096ce210a166b2aef9172e3fd5ea5b79769545efe692738b1e46` |
| 06 | Project Masters | `06-project-masters.png` | `dae5e9427613a125ac6544e56ec99af117f4d6c6d192199f2c1c4d200dd02658` |
| 07 | Project Readiness | `07-project-readiness.png` | `57848d3eeaffcb58cbe43e7afddd90d44a04321be6da1a3b461dd53a2a005f4a` |

## Visual source-of-truth

All seven screens must preserve the approved continuity with the existing Verigence sign-in/onboarding UI:

- deep navy → blue → teal gradient surrounding the application surface;
- large floating white rounded application surface;
- Verigence lockup in the top-left;
- elegant white/very-light task rail titled **Project Setup Journey**;
- dark navy headings and primary actions;
- teal active/completed journey steps and positive states;
- generous white space and restrained borders;
- dropdown/date-picker controls rather than free typing where a controlled selection exists;
- no generic grey enterprise-dashboard redesign.

## Frozen first-time flow

`Project Details → Dealers → Dealer Outlets → Employees → Role Mapping → Project Masters → Project Readiness → Activate Project`

Automatic provisioning of Security, Audit Core and Document Intelligence is background behaviour only and does not appear as a normal journey step.

## Important permanent rules

- UI says **Project**, not Tenant.
- Dealer has no latitude/longitude; Dealer Outlet owns map location and coordinates.
- Employee is added to Project before Role Mapping.
- Role Mapping uses Employee, Role, Dealer and Dealer Outlet controlled selections.
- Project Masters use Excel + explicit WEF + staging/validation + parsed-data preview + SuperAdmin confirmation.
- Product Master is ongoing effective-dated operational master data and must preserve historical meaning.
- Project Readiness covers the entire onboarding journey.
- The same activities remain available after activation for controlled Project Administration updates.

Any future visual or functional change to these screens must explicitly supersede this manifest and the frozen UI baseline rather than silently drifting from them.
