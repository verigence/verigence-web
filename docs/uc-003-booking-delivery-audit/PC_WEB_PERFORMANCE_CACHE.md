# UC03 PC Web performance and cache rules

Status: agreed implementation baseline for the PC operational Web journey.

## Objective

PC screen transitions must feel immediate. Network reads must not be triggered merely because the user moved between already-loaded screens. The UI should use the TanStack Query in-memory cache as the session operational cache and only load data when it is genuinely missing or a real state change requires reconciliation.

## Agreed rules

1. **No PC Journey Workspace dependency.** The legacy Journey Workspace is not part of the PC operational journey.
2. **Cache-first navigation.** Booking and Delivery operational records remain in TanStack Query memory for the authenticated session.
3. **Lazy loading.** Only the data required for the visible step is loaded. Booking Step 1 must not wait for Step 2 details/options.
4. **Mutation first, cache patch second.** A successful POST/PUT must update the relevant TanStack cache from the command result/local known change. The UI must not wait for a whole-workspace reload.
5. **No blanket refresh after a mutation.** `refreshAll()` and whole-workspace invalidation are not the normal success path.
6. **No focus/reconnect refresh for stable operational aggregates.** Returning to the browser window must not reload Booking/Delivery automatically.
7. **Session isolation.** Operational query data is cleared when the authenticated human/persona changes. Token renewal alone does not clear it.
8. **No IndexedDB/persistent browser cache in this step.** This implementation uses the existing TanStack Query memory cache only. Persistent caching can be considered separately later.
9. **No style changes.** Performance work must not introduce new styling or alter the approved layouts.
10. **No business-rule changes.** Existing Booking, PC verification and Delivery semantics remain unchanged.

## Booking loading model

### Step 1 – Documents

Cold load requires the Booking aggregate and Part-1 document requirements. Booking Details and reference/master options are lazy and load only when Step 2 is opened.

### Step 2 – Booking Details

Details and options are loaded on demand and then remain in the session cache. Saving details updates the cached details/version directly from the command response.

### Booking mutations

Start Booking, document upload, details save and Booking submit must not synchronously reload the complete Booking workspace. The page uses the command result and known uploaded document ID to update cache immediately. Any reconciliation that is genuinely required because an asynchronous external callback changes server state must happen in the background and must not block the user transition.

## Delivery loading model

The Delivery aggregate is a valid cold-load aggregate. Once loaded, it remains cached for the session. Intimation, VIN/chassis observation, document assessment/upload and Delivery completion patch only the affected cached fields from their command results. The whole Delivery aggregate is not invalidated after each operation.

## Review boundary

The Review screen reads document/extraction data directly from DI. Audit Core writes remain required when the PC saves approved/corrected values or completes PC verification.

**Cold Review read constraint:** the current dashboard/work-queue DTO does not contain `externalContextRef`, `customerId` or the full DI requirement context. Therefore a guarantee of *zero Audit Core reads on a fresh-login Review* cannot be implemented from the existing Web data alone without either:

- carrying the DI context in an earlier cached response, or
- changing an existing response/API contract.

This document does not invent that missing context. The existing direct-DI Review behavior remains until that separate data-contract decision is made.

## Validation expectations

- Re-opening an already loaded Booking/Delivery during the same session uses TanStack cache.
- Booking Step 1 does not load Step 2 details/options.
- Successful mutations do not perform blanket workspace refetches.
- Browser focus/reconnect does not reload stable Booking/Delivery aggregates.
- Logout or persona change clears operational query cache.
- No CSS/style file changes are part of this work.
