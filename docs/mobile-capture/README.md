# Verigence Mobile Document Capture

## Baseline

This feature branch was created from `dev` SHA:

`27a6c4e717a61da2951d8a6bd2e3076f33e198a5`

The feature is intentionally isolated from parallel Web work.

## Scope

Mobile capture only:

- Existing Login, project context, dashboard routes and desktop/web capture stay unchanged.
- Android Capacitor capture is activated only on the existing Booking/Delivery capture routes.
- The handset does **not** classify document type and does **not** perform business-field extraction.
- Server-side classification/extraction continues through the existing unified document upload API.
- No new backend endpoint is introduced.

## Capture contract

A physical file can contain up to 20 captured pages. Most pages are expected to be single-page logical documents; multi-page documents are the exception.

1. Google ML Kit Document Scanner captures/crops/cleans page images on supported Android devices.
2. Every page must pass the Verigence local quality gate before it can be uploaded.
3. Lightweight local OCR is used only to identify strong continuation evidence between adjacent pages.
4. Single-page is the default. Only HIGH continuation confidence auto-groups pages.
5. MEDIUM continuation confidence remains separate and is surfaced as a merge suggestion.
6. The user can manually merge documents or start a new document at any page boundary.
7. A one-page scan can be manually split top/bottom or left/right when two logical documents were photocopied on the same physical sheet.
8. Every logical document is packaged as one PDF.
9. PDFs are uploaded one at a time through the existing `uploadUnifiedCaptureFiles` path; this avoids six-way upload fan-out on low-cost phones and gives exact retry identity.

## Mandatory quality floor

Initial engineering values; calibrate against the dealer-document UAT corpus before GA.

| Check | Initial value |
| --- | ---: |
| Minimum short edge | 1000 px |
| Minimum long edge | 1600 px |
| Minimum pixels | 1.5 MP |
| Quality-analysis long edge | 1024 px |
| Minimum conservative Laplacian variance | 35 |
| Normalized maximum long edge | 2400 px |
| JPEG quality used for PDF pages | 0.82 |

Additional hard failures are severe darkness, severe overexposure, near-blank content, and unreadable image data.

A failing page has no "upload anyway" path. It must be retaken or corrected before upload.

OCR failure is **not** a quality failure. Handwritten or difficult pages can pass capture even when local OCR returns no useful text.

## Multi-page continuation policy

Continuation scoring uses only adjacent-page text and conservative signals:

- sequential `Page X of Y` numbering;
- same document/reference/policy/invoice/application number;
- explicit continuation wording;
- strong repeated document/header text.

Confidence policy:

- `HIGH` (>= 0.75): group automatically;
- `MEDIUM` (>= 0.50): keep separate and suggest merge;
- `LOW`: keep separate with no interruption.

This is document-boundary assistance, not classification.

## Device behavior

Primary path: `@capacitor-mlkit/document-scanner` on Android.

- page limit: 20;
- gallery import: disabled;
- scanner mode: FULL;
- result: JPEG pages for validation/grouping.

If the Google scanner module cannot be prepared or is unsupported, Verigence falls back to the existing Capacitor camera. Fallback capture is capped at 2400 px and never saves to the gallery. The same quality gate still applies.

## Privacy

- rejected pages are never uploaded;
- captures are not intentionally saved to the public Gallery;
- no OCR text is logged or sent to Gemini from the client;
- split-page blobs are retained only in the current capture session;
- the existing authenticated upload path remains the only server handoff.

## Production gate

Before moving this PR out of Draft:

- Web typecheck/build must pass;
- generated Android debug build must pass;
- scanner module install and capture must be tested on physical Android hardware;
- thresholds must be validated against representative printed, handwritten, ID, insurance, bank-statement, invoice and poor-quality samples on the target low-cost handset class.
