# UC03 PC Booking Review — Direct R2 Performance Amendment

Date: 27-Aug-2026

## Recovery baseline

Before the DI/R2 implementation changes, recovery snapshots were created at the exact current DEV heads:

- Audit Core: `snapshot/uc03-direct-r2-prechange-20260827` → `d871cb7416f4dec129d1ea3a88e59723fd0e6871`
- Document Intelligence: `snapshot/uc03-direct-r2-prechange-20260827` → `a57c606a2e908a29b03b2458f901072af7a4d7c1`

Audit Core requires no code change for this performance amendment; the Audit Core snapshot is retained as the safe cross-service recovery baseline requested for UC03.

## Problem

PC Review was paying two avoidable costs:

1. the route waited on Audit Core workspace/review state reads before the first DI document could become useful;
2. original PDF/image bytes travelled `R2 -> DI Railway -> client` through the DI content streaming endpoint.

For a four-document Booking this created a noticeable delay before Review became interactive.

## Agreed Review architecture

The PC Review hot path is intentionally simple:

```text
Work Queue
   |
   v
Review route
   |
   +--> cached externalContextRef + document ids
   |
   +--> DI extraction-review JSON        (fields/confidence/page/boxes)
   |
   +--> signed R2 URL -----------------> R2 original document bytes
   |
   +--> Audit Core state in background only
```

Audit Core does not gate the Review screen and does not decide which DI fields are visible.

## Step 1 upload contract

The existing PC Booking upload remains direct Web/Mobile -> DI. Once DI has stored the original artifact, the same upload response now returns a short-lived signed direct-storage URL:

```json
{
  "documentId": "...",
  "uploadStatus": "ACCEPTED",
  "processingStatus": "PROCESSING",
  "contentUrl": "https://...signed...",
  "contentUrlExpiresAtUtc": "...",
  "mimeType": "application/pdf"
}
```

Web immediately caches the stable document/context information plus this temporary content access in session storage. The signed URL is an optimization, not a durable business field.

## URL expiry

Signed content URLs live for 30 minutes.

When Review is opened later and the cached URL is missing, expired or within 30 seconds of expiry, Web makes only this small authorized DI request:

```http
GET /v1/tenants/{tenantId}/audit-storage-contexts/{externalContextRef}/pc-booking-documents/{documentId}/content-url
```

DI verifies the existing `di.document.content.read` permission and the document's tenant/context membership, then mints a fresh URL. The subsequent PDF/image bytes still travel directly from R2 to the client.

If R2 itself returns 401/403 because a URL expired between checks, Web refreshes the URL once and retries the direct object read.

## Lazy loading

Review does not wait for all four documents.

- Document 1 starts immediately.
- Document 2 is unlocked when Document 1 extraction settles.
- Document 3 follows Document 2.
- Document 4 follows Document 3.

DI extraction JSON and source content for the active document are loaded independently, so extracted values can become useful without waiting for the source file download to complete.

## Network boundary

Normal Review traffic is:

```text
DI: small JSON only
R2: PDF/image bytes directly
Audit Core: reviewed field batch on Save; verification command at the end
```

The legacy DI `/content` streaming endpoint remains available for compatibility, but the UC03 PC Review implementation does not use it as its normal source-document path.

## Mobile

The Android app uses the same React application inside Capacitor. The direct signed-URL path therefore works for Mobile as well as Web without a native R2 SDK or any R2 credentials in the application.

Capacitor is configured with HTTPS and hostname `localhost`, making the Android WebView origin `https://localhost`. R2 CORS must allow that origin in addition to deployed Web origins.

## R2 configuration required

The bucket stays private. Do not enable public bucket access.

R2 CORS must allow direct browser/WebView reads for:

- the actual Verigence Web DEV origin;
- the actual Verigence Web PROD origin;
- `https://localhost` for Capacitor Android.

Minimum recommended policy:

```json
[
  {
    "AllowedOrigins": [
      "<WEB_DEV_ORIGIN>",
      "<WEB_PROD_ORIGIN>",
      "https://localhost"
    ],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["Range", "Content-Type"],
    "ExposeHeaders": [
      "Content-Type",
      "Content-Length",
      "ETag",
      "Accept-Ranges",
      "Content-Range"
    ],
    "MaxAgeSeconds": 3600
  }
]
```

Use explicit origins rather than `*` where possible. No R2 access key or secret is exposed to Web/Mobile.

## Security properties

- DI owns authorization before a new content URL is minted.
- The signed URL contains temporary object-read authority only.
- Web sends `credentials: omit` to R2 and never forwards the Security bearer token to object storage.
- Internal R2 logical object keys are not exposed as part of the Review contract.
- Purged objects cannot receive a new signed URL.

## Audit Core persistence

This amendment does not change the agreed Review persistence model:

- Web displays all DI fields.
- PC only changes incorrect values.
- One batch save sends all extracted fields to Audit Core.
- Audit Core stores `extracted_value`, nullable `modified_value` and confidence for every field.
- Existing known fields may additionally project to typed domain tables.

The performance change affects only how Review is opened and how source bytes are delivered.
