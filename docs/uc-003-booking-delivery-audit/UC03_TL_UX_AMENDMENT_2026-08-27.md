# UC03 Team Lead UX Amendment

**Date:** 2026-08-27  
**Status:** Approved product decision / Web implementation input  
**Applies to:** UC03 Booking & Delivery Audit  
**Supersedes:** any Web/UX wording that presents Team Lead review as mandatory before normal PC Booking/Delivery progression.

## 1. TL journey model

The Team Lead (TL) journey is a supervisory workflow, separate from the PC capture workflow.

TL is **not read-only**, but TL is also **not a document capture user**.

TL review is optional in the current phase. The existence or absence of TL review must not block the normal PC Booking/Delivery journey.

## 2. TL landing/dashboard

TL landing must show the complete operational scope of the TL's assigned Dealers and every Outlet under those Dealers.

The dashboard must support:

- overall Booking/Delivery count;
- Outlet-wise count;
- individual PC-wise count;
- submitted/progressed case list;
- filters/drill-down by Outlet, PC and current business stage.

Unsubmitted PC drafts are excluded from this supervisory view for the current phase.

## 3. Primary case status

The primary status displayed to TL represents the latest business stage.

Current phase examples:

- `Booking Submitted` — Booking is submitted and Delivery has not started;
- `Delivery In Progress` — Delivery has started and is not complete;
- `Delivery Completed` — Delivery has completed/submitted using the final approved UC03 wording.

Optional TL review activity can be displayed separately (for example, Reviewed by TL / Correction made / Re-upload requested), but it must not replace the business-stage status.

There is no default `Pending TL Approval` gate.

## 4. TL case review

From a submitted/progressed case TL can:

- open Booking/Delivery information;
- open submitted documents;
- inspect the complete extracted-field set available for that submitted document/journey;
- review and verify extracted values;
- overwrite/correct permitted extracted values;
- see extracted/original and modified values clearly where a correction exists;
- see correction provenance/history;
- request the responsible PC to upload/re-upload a document when the document itself needs replacement.

TL correction/verification is an optional supervisory action, not a completion prerequisite.

## 5. No TL document upload

Do not show direct document upload/camera/replace controls to TL.

If a document is wrong, missing, unreadable or requires replacement, TL uses **Request re-upload** (final copy may use equivalent approved wording).

The actual document upload/re-upload is performed by the responsible PC.

## 6. Re-upload request UX

When TL requests a re-upload, the UI should capture only the minimum useful context:

- affected document;
- short reason/remark;
- responsible PC/case context derived from the case.

After submission:

- TL sees the request as open/pending PC action;
- PC sees a clear action in the PC work queue/case;
- once PC uploads the replacement, the request becomes resolved and the latest document becomes available for supervisory review;
- the case remains in its actual Booking/Delivery business stage rather than being converted into a global mandatory TL approval state.

## 7. Non-blocking examples

### Booking submitted, TL does nothing

```text
Booking Submitted
PC: Sanjay Hati
Outlet: <Outlet Name>
TL review: Not reviewed (optional)
```

The PC may continue into the permitted Delivery flow.

### Delivery in progress, TL reviews fields

```text
Delivery In Progress
TL review: Reviewed
2 fields corrected
```

The primary status remains Delivery In Progress.

### TL asks PC to re-upload one document

```text
Delivery In Progress
Document action: Re-upload requested
Assigned to PC
```

Only that document action is outstanding; this does not create a mandatory TL approval gate for every case.

## 8. Correction UX

For a field corrected by TL, present the distinction explicitly:

```text
Extracted value   <original>
Current value     <TL corrected value>
Corrected by      <TL name> · <time>
```

Do not hide or overwrite the original extracted value in the UI history.

## 9. Relationship to existing UC03 UX contract

The existing UC03 UX contract contains examples such as `Team Lead review required` and `Team Lead review: Required`. Those examples are no longer authoritative for the current phase.

They must be interpreted as follows:

- TL has authority to review;
- TL review may be performed when useful;
- TL review is not mandatory by default;
- normal PC Booking/Delivery progression must not wait for TL approval;
- a TL-generated re-upload request is a specific PC action, not a global approval gate.

## 10. Web acceptance criteria

1. TL has a dedicated supervisory experience; PC capture controls are not reused as editable upload controls for TL.
2. TL sees all authorized Dealer -> Outlet activity and no out-of-scope activity.
3. Overall, Outlet and PC counts reconcile with the case list.
4. TL can drill into submitted/progressed Booking/Delivery cases.
5. TL can review/verify/correct permitted extracted values.
6. TL cannot directly upload/re-upload documents.
7. TL can request PC re-upload and see its resolution state.
8. PC sees the re-upload request as an actionable item.
9. Absence of TL review never blocks PC Booking/Delivery progression in this phase.
10. Business-stage status remains primary; TL review metadata is secondary.
