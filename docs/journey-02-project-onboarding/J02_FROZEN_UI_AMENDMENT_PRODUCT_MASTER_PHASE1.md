# Journey 02 — Frozen UI Amendment: Product Master Phase 1

**Status:** FROZEN REQUIREMENT  
**Date:** 21-Aug-2026  
**Branch:** `planning/uc-002-project-onboarding`  
**Applies to:** `J02_FROZEN_UI_BASELINE.md`

This amendment closes the Product Master scope question that was still marked open in the frozen UC02 baseline.

## Phase-1 Product Master rule

Keep Phase 1 simple.

- Product Master remains part of **Project Masters**.
- The SuperAdmin uploads and maintains the Product Master for the current Project.
- Product Master supports repeated effective-dated Excel versions.
- WEF / Valid From is mandatory and starts blank.
- Excel is parsed and previewed before confirmation.
- Published historical Product versions are not overwritten in place.
- Product/Price/Discount history must remain reproducible for the Project.
- Phase 1 does **not** expose a UI to search/select/reuse another Project's Product Master.

## Phase-2 note

Phase 2 may add an option for a Project to pick/reuse an existing approved Product Master/catalogue instead of uploading a new one from scratch.

The exact reuse/copy/reference semantics are intentionally deferred to Phase-2 design.

## UI impact

No visual redesign of the approved `Project Masters` mockup is required for Phase 1.

The Product Master row continues to provide the normal versioned upload/history actions. There is no `Pick Existing Master` action in Phase 1.