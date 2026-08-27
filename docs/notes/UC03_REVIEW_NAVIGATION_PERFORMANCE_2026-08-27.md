# UC03 Review Navigation Performance — 27-Aug-2026

## Symptom
PC reports approximately 15 seconds between selecting **Review Documents** on the Work Queue and seeing the Booking Review screen.

## Finding
The Booking Review route is React-lazy loaded. Its route chunk currently includes the PDF.js renderer because `DirectDiFieldReview` imports `PdfPageReview` statically. The latest CI build showed `BookingReviewPage` at roughly 449.6 kB minified / 134.1 kB gzip, while the PDF worker is a separate 1.26 MB asset. On a slower browser/mobile connection the route module download/evaluation can therefore delay route presentation before document APIs are relevant.

## Change
1. Split the PDF renderer out of the Booking Review route chunk by lazy-loading `PdfPageReview` only when a PDF preview is actually required.
2. Preload the Booking Review route module in the background while a PC is already on the Work Queue, so normal Review clicks consume a warm module.
3. Keep PDF document bytes/range-loading and DI extraction independent; this change only targets Work Queue → Review navigation latency.

## Expected behavior
The Review screen shell and extracted-field UI should be able to mount without waiting for PDF.js. PDF viewer code loads inside the document preview after route entry. PC Work Queue sessions opportunistically warm the smaller Review route chunk before the user clicks Review.
