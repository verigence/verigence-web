# UC03 Delivery Screen 1 Next Gate

Rule restored on `fix/uc03-delivery-screen1-next`:

- Missing configured Delivery documents do not block progression.
- With zero uploaded documents, Next is available.
- With one or more uploaded documents, Next is available only when every uploaded document is `CLASSIFIED` and has a resolved classified document type.
- Post-classification extraction/processing does not block Next.
- Screen 1 no longer submits directly to Review; Next opens Delivery Details & Vehicle Evidence (Screen 2).
- Delivery submission remains on Screen 2.
