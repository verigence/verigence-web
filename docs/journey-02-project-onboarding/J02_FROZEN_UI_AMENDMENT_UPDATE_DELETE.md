# Journey 02 — Frozen UI Amendment: Update & Hard Delete

**Status:** FROZEN REQUIREMENT — owner decision applied  
**Date:** 21-Aug-2026  
**Applies to:** `J02_FROZEN_UI_BASELINE.md` and approved Journey-02 mockups

This amendment records the owner requirement that the approved Journey-02 administration screens are not create-only: they must support update and a real Phase-1 hard-delete action where the owning backend permits it.

## 1. Phase-1 rule

Phase 1 intentionally supports SuperAdmin hard delete because the product is new and Project/setup rollback may be required even after activation.

This deliberately supersedes the earlier Audit Core v2.1 no-public-delete assumption **for UC02 administrative rollback APIs only**. Normal operational users and normal audit-work APIs do not gain general destructive privileges.

Phase 2 will move to process-oriented lifecycle, maker/checker, retention, inactivate, retire and supersede controls.

## 2. UI behaviour

| Area | Update | Destructive/removal action |
|---|---|---|
| Project | Edit approved mutable Project fields | SuperAdmin Hard Delete / Start Fresh, including post-activation rollback, through cross-module preflight/orchestration |
| Dealer | Edit | SuperAdmin Hard Delete; backend returns dependency impact and may reject direct delete when operational descendants require whole-Project rollback |
| Dealer Outlet | Edit details/map/type/address/coordinates | SuperAdmin Hard Delete with dependency/preflight handling |
| Employee / Project assignment | Managed through existing Security Tenant operating-role assignment | Remove Project role/business mappings; never delete global USER as a side effect |
| Role Mapping | Edit/replace | Remove mapping |
| Project Masters | Edit DRAFT; create new version after publish | Hard delete DRAFT where permitted; whole-Project rollback may remove Project-scoped master history. Published versions are not silently overwritten in a live Project. |
| Project Readiness | Re-run | No row-level destructive action |

## 3. Human-admin identity rule

Every create/update/delete/activate operation that is an administrative action must execute using the authenticated human administrator identity.

For UC02, the browser calls Audit Core. When Audit Core must call a downstream Security or DI administrative API, it passes the same Security-issued human Bearer token/identity through. It must not replace that identity with a `ServiceIntegration` machine token.

`ServiceIntegration` remains for ordinary module-to-module processing, background integration and Security authorization-check calls.

## 4. Destructive-action interaction rule

Every destructive/removal action must:

1. identify exactly what will be deleted/removed;
2. show dependency/preflight impact before confirmation;
3. require explicit destructive confirmation;
4. use the authenticated SuperAdmin human identity for owning administrative APIs;
5. fail safely with an actionable dependency reason when a narrower entity cannot be deleted independently;
6. support idempotent retry when a timeout or partial cross-module failure occurs;
7. refresh the current task/readiness state after success;
8. never imply that a global USER or unrelated Tenant/Project was deleted;
9. never report whole-Project deletion complete until cross-module deletion/zero-state verification succeeds.

## 5. Project hard-delete order

The exact physical implementation belongs to the owning module designs, but the UC02 orchestration rule is:

1. preflight and identify Project-owned dependencies;
2. stop/reject new Project-scoped work while deletion is running;
3. delete DI Project/Tenant-owned document/config state and object content required by the approved purge contract;
4. delete Audit Core Project-owned hierarchy and Project-scoped history according to its UC02 administrative-delete design;
5. delete the canonical Security Tenant **last**;
6. verify zero-state and retain only the explicitly approved platform-level deletion receipt/audit evidence.

A global Verigence USER is never deleted simply because a Project is deleted.

## 6. Testing rule

Hard-delete/removal behaviour is a mandatory UC02 release gate. It must be tested for:

- unauthenticated and non-SuperAdmin denial;
- ServiceIntegration denial on human-admin-only endpoints;
- exact human-token pass-through to downstream admin APIs;
- cross-Project/Tenant isolation and ID tampering;
- dependency/preflight correctness;
- Project deletion after activation;
- retry/idempotency after timeout;
- partial Security/Audit Core/DI failure and resume;
- concurrency with update/create operations;
- global USER preservation;
- cross-module zero-state verification.

## 7. Phase-2 note

Phase 2 shall replace broad rollback-oriented hard deletion with a process-oriented deletion/lifecycle model, including maker/checker where required, retention rules, controlled inactivation/end-dating/retirement/supersession and stronger historical preservation policies.