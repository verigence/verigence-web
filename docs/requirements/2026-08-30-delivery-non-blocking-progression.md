# Delivery progression rule — 2026-08-30

## Decision date
30 August 2026

## Current rule
Delivery document processing is asynchronous and must not block the Process Consultant or the Delivery journey.

- `Next` from Delivery Screen 1 must not depend on document classification completion.
- `Next` must not depend on extraction completion.
- Missing configured documents, including configured mandatory documents, do not block progression.
- Failed, delayed, stuck, or unclassified documents remain visible as audit/document-processing status and must not stop the user moving to Delivery Details.
- Classification/extraction may continue in the background after the user proceeds.
- The UI may temporarily disable `Next` only while a local Screen 1 mutation such as an upload or delete request is actively being committed, to avoid conflicting/double actions.

## Requirement precedence
This dated decision supersedes older Delivery rules that required all uploaded documents, or all mandatory documents, to be classified before progression.

When requirements change, the newest explicit dated requirement takes precedence over contradictory historical requirements.
