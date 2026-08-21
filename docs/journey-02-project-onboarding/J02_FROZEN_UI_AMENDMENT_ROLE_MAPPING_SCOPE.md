# Journey 02 — Frozen UI Amendment: Role Mapping Scope

**Status:** APPROVED OWNER CORRECTION / SUPERSEDES PRIOR ROLE-SCOPE RULES  
**Date:** 21-Aug-2026  
**Branch:** `planning/uc-002-project-onboarding`

This amendment supersedes the **Role Mapping** business mapping rules in `J02_FROZEN_UI_BASELINE.md` and corresponding UC02 implementation-plan text wherever they state that TL is Dealer-scoped or CRM may be Dealer-scoped.

## Correct Role Mapping rules

- **PC → one primary ONSITE Dealer Outlet + optional one SATELLITE Dealer Outlet**.
- **TL → whole Project**.
- **PM → whole Project**.
- **CRM → whole Project**.
- **Executive → whole Project**.

### PC interaction rule

A PC must have one primary ONSITE Dealer Outlet. The same PC may additionally cover one SATELLITE Dealer Outlet. The UI must not allow more than:

- `1 x ONSITE`; and
- optional `1 x SATELLITE`.

The following are invalid:

- two ONSITE Outlets for one PC;
- two SATELLITE Outlets for one PC;
- SATELLITE-only mapping;
- more than two Outlet assignments for one PC.

Dealer may be shown as a filtering/navigation control when choosing a PC's Dealer Outlet, but Dealer is derived from the selected Outlet and is not an independent persisted PC scope.

### TL / CRM interaction rule

TL and CRM are **not Dealer-scoped**. Their Role Mapping screen must not persist a Dealer or Dealer Outlet scope. They are Project-wide roles, the same scope shape as PM and Executive.

The Project Readiness blocking rule remains unchanged: every ACTIVE Dealer Outlet must have at least one ACTIVE PC mapping.
