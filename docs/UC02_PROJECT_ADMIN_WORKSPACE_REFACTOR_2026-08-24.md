# UC02 Project Administration Workspace Refactor

**Date:** 2026-08-24
**Scope:** UC02 Web only

## Frozen constraints

- **Do not modify UC03 UI in this change.**
- Preserve existing Verigence logos, colours, typography, status colours, button colours and brand tokens.
- This is a layout/usability refactor, not a visual rebrand.

## Desktop administration pattern

Project Administration keeps the existing eight-step flow but moves data-heavy steps to a **list/table first** pattern:

- full-width persisted data table/list;
- Add action in the step header;
- Edit in a focused drawer/modal/panel;
- Delete/Remove/Replace actions per row where the backend contract allows them;
- normal browser vertical scrolling;
- no fixed-height main workspace clipping;
- horizontal table scrolling only where required.

## Step rules

1. Project Details — retain current editable Project fields and current branding.
2. Dealers — full-width table, Add Dealer, Edit, Delete.
3. Dealer Outlets — all-Dealer table with Dealer filter; Add/Edit in focused panel; large Maps area; Delete.
4. Employees — full-width Security-backed employee list; Map Role action. Global USER deletion is not part of Project Administration.
5. Role Mapping — Active Mappings first; Assign/Edit Mapping in focused editor; Edit + Remove actions.
6. Project Masters — full-width master catalogue with status, WEF, rows/reference and actions; Upload/Replace/Review/Delete/Reset as applicable. File chooser is secondary, not the dominant permanent layout.
7. Readiness — render all checks and blocker reasons with target-step actions.
8. Activate Project — summary + readiness blockers + activation action.

## Administration authority

Tenant Admin may administer the complete Project assigned to its Tenant. SuperAdmin retains cross-Tenant administration. Project Master reset is available to Tenant Admin for its Tenant and to SuperAdmin, only while the Project is CONFIGURING.
