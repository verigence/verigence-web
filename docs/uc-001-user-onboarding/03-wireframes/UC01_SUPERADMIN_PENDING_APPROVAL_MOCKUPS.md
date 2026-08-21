# UC-001 — SuperAdmin Pending Approval Mockup Baseline

**Status:** FROZEN FOR IMPLEMENTATION PLANNING  
**Date:** 2026-08-21  
**Branch:** `planning/uc-001-user-onboarding`

## Purpose

This document freezes the approved visual direction for the remaining UC-001 SuperAdmin approval work.

The visual language must continue directly from the approved Sign In / Sign Up experience and the approved UC-02 Project Onboarding mockups:

- use the same approved Verigence lockup/logo asset as Sign In and Sign Up;
- navy -> blue -> teal branded outer background;
- large rounded white application surface;
- restrained borders and generous whitespace;
- deep navy primary action;
- teal active/focus accents;
- red destructive/rejection action;
- no generic unrelated admin-dashboard theme.

## Approved screen terminology

Use **Pending Approval** as the SuperAdmin area name.

The primary tabs are:

1. **Pending Requests**
2. **Current Employees & Engagements**

Do not use `User Onboarding` as the visible section name for this SuperAdmin screen.

## Pending Requests — frozen UC-001 semantics

The approval decision remains the existing UC-001 global USER decision only:

```text
PENDING -> ACTIVE
PENDING -> REJECTED
```

The screen must not assign or edit Project, operating role, Dealer/Dealer Outlet, business scope or permission bundles as part of activation/rejection.

Pending-user detail is limited to the approved Security USER fields used by the current UC-001 implementation:

- display name;
- primary email;
- primary mobile;
- USER status;
- onboarding status;
- created/registered timestamp;
- USER ID.

Required decision states:

- pending queue;
- selected authoritative USER detail;
- confirm activation;
- confirm rejection;
- decision in progress;
- success/state refresh;
- stale/conflict/error.

No rejection-reason control is added to UC-001.

## Current Employees & Engagements — approved UI addition

This is a **browse-only** SuperAdmin view.

The view must allow the SuperAdmin to see current/active Verigence employees and, where a Project association exists, their current engagement(s).

Employee identity/status remains Security-owned. Project/Dealer/Dealer Outlet engagement data remains Audit Core-owned.

The mockup shows the intended combined presentation, but the current UC-001 contract does not yet define the required cross-module read API for engagement aggregation. That API is therefore an implementation prerequisite and must be frozen in the owning backend design before coding the tab.

The browse view must not become a hidden Role Mapping editor. Project/role/business-scope changes remain UC-02 Project Administration concerns.

## Stored mockup files

The following approved mockups are stored beside this document:

- `UC01_PENDING_APPROVAL_MAIN.png`
- `UC01_PENDING_APPROVAL_CONFIRM_ACTIVATION.png`
- `UC01_PENDING_APPROVAL_CONFIRM_REJECTION.png`

These files are the visual reference for the UC-001 SuperAdmin approval redesign.
