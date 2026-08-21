# Journey 02 — Frozen UI Amendment: Update & Destructive Actions

**Status:** FROZEN REQUIREMENT — destructive semantics pending owner decision  
**Date:** 21-Aug-2026  
**Applies to:** `J02_FROZEN_UI_BASELINE.md` and approved Journey-02 mockups

This amendment records the owner requirement that the approved Journey-02 screens must support later administration, including update and an explicit destructive/removal action where the domain permits it.

## 1. UI behaviour

All relevant list/detail screens must expose a consistent Action affordance rather than being create-only.

| Area | Update | Destructive/removal action |
|---|---|---|
| Project | Edit approved mutable Project fields | Whole Project delete is not normal UC02; use separately approved Start Fresh / Phase-2 deletion flow |
| Dealer | Edit | Delete or Inactivate according to approved dependency/lifecycle policy |
| Dealer Outlet | Edit details/map/type/coordinates | Delete or Inactivate according to approved dependency/lifecycle policy |
| Employee in Project | N/A for global USER profile from this screen | Remove Employee from Project; never delete global USER as a side effect |
| Role Mapping | Edit/replace/end-date | Remove mapping |
| Project Masters | Edit DRAFT; create new version after publish | Delete DRAFT only if approved/unreferenced; published version uses Retire/Supersede, never silent history removal |
| Project Readiness | Re-run | No destructive action |

## 2. Destructive-action interaction rule

Every destructive/removal action must:

1. identify exactly what will be removed/changed;
2. show dependency impact before confirmation where applicable;
3. require an explicit confirmation action;
4. fail safely when the resource is protected/referenced;
5. surface the reason when hard delete is not permitted and offer the approved lifecycle alternative (`Inactivate`, `Retire`, end-date, remove mapping, etc.);
6. refresh the current task/readiness state after success;
7. never imply that a global USER, historical Journey or published master was physically deleted unless the owning backend actually completed that operation.

## 3. Testing rule

Delete/removal behaviour is a mandatory UC02 release gate. It must be tested for authorization, cross-Project/Tenant isolation, dependency safety, retry/idempotency, partial failure, concurrency and historical integrity.

The exact hard-delete boundary is intentionally **not invented here** because Audit Core v2.1 currently has an explicit no-public-delete design. Final semantics are governed by `UC02_IMPLEMENTATION_PLAN_v1.0.md` OPEN-03 after owner approval.
