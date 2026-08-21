# UC-002 Continuation Pointer — UC-001 First

**Date:** 2026-08-21  
**Branch:** `planning/uc-002-project-onboarding`

UC-002 Web implementation must not proceed ahead of completion of the remaining UC-001 SuperAdmin Pending Approval work.

The authoritative integrated execution plan is:

```text
verigence/verigence-web
branch: planning/uc-001-user-onboarding
docs/handoff/UC01_THEN_UC02_INTEGRATED_IMPLEMENTATION_PLAN_2026-08-21.md
```

Implementation order:

1. finish and runtime-verify UC-001;
2. freeze/implement the Current Employees & Engagements read contract required by the approved UC-001 SuperAdmin screen;
3. merge/finalize UC-001;
4. reconcile this UC-002 branch with the completed shared visual/application shell;
5. implement UC-002 backend prerequisites in Security -> Audit Core -> DI dependency order;
6. implement the frozen UC-002 Web journey;
7. complete cross-module creation/update/master/readiness/delete/recovery testing.

Do not create a second visual design system for UC-002. Sign In, Sign Up, UC-001 Pending Approval and UC-002 Project Onboarding must use the same approved Verigence lockup and visual language.
