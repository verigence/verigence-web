# UC-002 Continuation Pointer — UC-001 Promotion Complete, Browse Deferred

**Date:** 2026-08-21  
**Branch:** `planning/uc-002-project-onboarding`  
**Status:** UC-002 MAY PROCEED AFTER UC-001 PROMOTION; EMPLOYEE/ENGAGEMENT BROWSE DEFERRED UNTIL AFTER UC-002

The earlier sequence required all UC-001 browse work to complete before UC-002. That ordering is superseded by the owner priority decision recorded on 21-Aug-2026.

## Current priority/order

1. UC01-WEB-01 Pending Approval visual shell has been selectively promoted to `verigence-web/main` without wholesale-merging the older planning branch.
2. The main-branch build/typecheck/logo verification passed for the promoted package; Cloudflare publication remains operationally blocked because the deployment runner does not currently receive `CLOUDFLARE_API_TOKEN`.
3. Do not redesign or extend the UC-001 Pending Requests lifecycle while starting UC-002.
4. Proceed with UC-002 Project Onboarding/Administration as the higher-priority implementation.
5. Defer `Current Employees & Engagements` aggregation and `AC-UC01-READ-001` until after UC-002 is complete and runtime-verified.
6. After UC-002, reopen the deferred employee-browse implementation plan, reconcile against the final UC-002 Role Mapping/business-assignment model, freeze the missing backend read contract, test authorization/isolation, then implement Web browse integration.

## Deferred browse authorization rules already frozen

When the post-UC-002 browse work resumes:

- **PC:** must not see engagement or assignment information belonging to other employees.
- **TL:** may see employees assigned within the same Dealer that the TL is authorized to supervise; no unrelated Dealer/Project staffing visibility.
- Dealer scope must come from authoritative Audit Core business assignments, never browser-supplied or name-matched scope.
- No PM/CRM/Executive/Tenant Admin browse visibility rule is frozen yet; do not infer one.
- The SuperAdmin platform `Current Employees & Engagements` aggregate remains a separate administrative browse capability and still requires a frozen `AC-UC01-READ-001` contract.

## UC-002 source of truth

Before UC-002 code changes, read the frozen Web baseline/plan and the current owning-module `dev` designs listed there. Preserve the implementation dependency order:

```text
Security UC-002 deltas
 -> Audit Core Project/Dealer/Dealer Outlet + Role Mapping
 -> Audit Core Masters/Product Master
 -> DI storage/admin deltas
 -> Audit Core readiness/delete integration
 -> UC-002 Web
 -> cross-module runtime/recovery/delete verification
```

Do not create a second visual design system for UC-002. Sign In, Sign Up, UC-001 Pending Approval and UC-002 Project Onboarding must use the same approved Verigence lockup and visual language.

The deferred browse plan is maintained in the UC-001/main handoff set as:

```text
docs/handoff/UC01_POST_UC02_EMPLOYEE_BROWSE_IMPLEMENTATION_PLAN_2026-08-21.md
```
