# DI Test Console — DEV Only

## Purpose

`Administration -> DI Test Console` is a persistent DEV QA utility for exercising the real Verigence Document Intelligence service with original test documents.

It is intended for repeated validation of many document types without adding one-off test pages or bypassing the DI lifecycle.

## Fixed DEV flow

```text
Browser-selected original file
  -> DI POST /subjects/{subjectId}/documents
  -> DI intake/storage/quality
  -> DI worker
  -> configured Document AI provider
  -> DI confirmation
  -> DI GET /documents/{documentId}/fields
  -> optional DI POST /analyse
```

The Web console does not perform OCR, parse the document itself, inject values, correct extracted fields, or manufacture a successful result.

## Access

- Route: `/admin/di-test`
- Persona: `SUPER_ADMIN`
- Hidden outside local/DEV hosts unless `VITE_ENABLE_DI_TEST_CONSOLE=true` is explicitly set.
- The DI mock token protocol is used only against non-production DI. DI itself rejects mock tokens when `DI_ENV=production`.

## DEV defaults

- DI API: `https://di-api-dev.up.railway.app`
- Tenant: `70c5661e-bab2-46e7-8199-0f9c32acbac3`
- Actor: `e2e-di-rules`
- Role: `TENANT_ADMIN`

Optional build-time overrides:

- `VITE_DI_TEST_BASE_URL`
- `VITE_DI_TEST_TENANT_ID`
- `VITE_DI_TEST_ACTOR_ID`
- `VITE_ENABLE_DI_TEST_CONSOLE`

## Supported document types

The console includes the currently seeded DI document keys, including Booking Form, Booking Docket, PAN Card, Aadhaar Card, Passport, Driving Licence, Voter ID, Bank Statement, Insurance Cover Note, Dealer Receipt, Delivery Order Cover and other current DI types.

A custom `documentTypeKey` option is also available so a newly configured DI type can be tested without changing the console first.

## Output shown

For every upload the console shows the values returned by DI:

- document ID;
- upload status;
- processing status;
- confirmation status;
- document confidence;
- `fieldKey`;
- `currentValue`;
- `valueSource`;
- field confidence;
- raw DI response.

If DI fails processing or does not confirm the document, the console shows that state and does not synthesize `/fields` output.

## Rule Engine

All documents in the current browser session that reach `PROCESSED` can be sent to DI `/analyse`. The resulting rule analysis JSON is shown without client-side modification.

## Test-data handling

Documents are selected in the browser and submitted directly to the DEV DI endpoint. The console does not commit uploaded files to the Web repository and does not persist file bytes in browser storage.

The active test Subject ID is retained in browser `localStorage` so multiple related documents can be tested against the same Subject. `Create New Test Subject` starts a clean logical case.
