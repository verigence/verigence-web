# Verigence V1 — Web Screen Map

**Scope:** Web application only until Web sign-off.  
**Rule:** Other Verigence modules remain read-only during this phase.  
**Runtime:** `VITE_WEB_MODE=demo` provides a complete navigable Web Preview; `VITE_WEB_MODE=core` switches supported screens/actions to existing Audit Core contracts.

## Public/onboarding

1. Sign in / Web Preview role entry
2. Sign-up / access request
3. Pending-approval confirmation

## Operational workspace

4. Role-aware overview/dashboard
5. Customers
6. Journeys
7. Journey detail/workspace
   - Booking
   - Commercials / discount
   - Payment
   - Finance / DO / PO context
   - Insurance
   - Trade-in
   - Vehicle / VIN / chassis
   - Registration
   - Delivery
   - Audit review
8. Source evidence register
9. Evidence detail / extracted facts
10. Payment verification tracker
11. My work / task queue
12. Daily audit operations
13. PC/TL activity tracker
14. PC daily notepad

## Assurance/governance

15. TL/PM review queue
16. Findings register
17. Escalations register
18. Analytics / management insights

## CRM

19. CRM follow-up workspace

## Administration

20. Access approval queue
21. Project / Dealer / Outlet organization setup
22. Team and Project/Dealer/Outlet assignments
23. Dealership participant references
24. Masters & controls
   - Product catalogue
   - Price lists
   - Discount schemes
   - Supporting classifications
   - Document requirements
   - Validation thresholds/tolerances
25. Profile/session context

## Evidence-first UX rule

Operational audit users do not re-key source facts merely because a form can be built. Booking, commercial, payment, insurance, vehicle, registration and delivery facts are presented as read-only evidence/system projections. Users manually enter only genuine new workflow information such as review remarks, findings, escalation notes, CRM outcomes, daily notepad content or administrative master/configuration changes.

## Backend dependency model

Screens are not hidden just because a backend aggregate is missing. Web Preview supplies isolated demo repositories so every route and role can be reviewed now. The progress tracker records which production actions are already Core-backed and which require backend work after Web sign-off.
