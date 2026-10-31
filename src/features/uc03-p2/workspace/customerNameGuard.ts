/**
 * Is a dropped file another customer's? (product owner 2026-10-31)
 *
 * PCs name each customer's PDF after the customer ("Azizur Reheman.pdf",
 * "Tapan kumar patra.pdf"). On a new booking the first file creates the
 * booking and the screen becomes that booking, so the next customer's file
 * dropped on the same screen went into it: on 22 Oct one PC put 14 customers'
 * files into one booking. Before a file is uploaded into a booking that
 * already has files, its name is compared with the names the booking knows:
 * the customer named from its documents and its earlier files' names.
 *
 * The comparison only decides whether to ask the PC, never whether to refuse,
 * and it leans towards letting a file through (no friction on a normal upload;
 * Audit Core still checks whose each file is from the documents in it):
 *  - the extension, digits, punctuation and words that describe the file
 *    rather than a person (booking, delivery, invoice, pan, scan, copy, "(1)")
 *    are dropped;
 *  - so are honorifics and the name parts many customers share (Kumar, Kumari,
 *    Devi, Md, Mohammad; Private Limited, Enterprises), so "Tapan Kumar Patra"
 *    and "Prasana Kumar Senapati" still read as two people;
 *  - what is left is uppercased; two names are the same customer when they
 *    share a word of three or more letters, a spelling variant counting as
 *    shared ("Reheman", "Rehaman" and "Rehman" have the same consonants);
 *  - a file with no such word (IMG_20261019_120541.jpg, scan001.pdf) names no
 *    one and goes straight through.
 */

import type { P2DocumentsResponse } from '../../../services/audit-core/uc03P2';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Words that describe the file, the document in it, or the phone or app that
 * made it -- never a person. Dropped from the comparison and from display. */
const FILE_WORDS = new Set(`
  BOOKING BOOKINGS BOOKED BOOK DELIVERY DELIVERIES DELIVERED FILE FILES PAGE PAGES COPY COPIES FINAL
  SCAN SCANS SCANNED SCANNER CAMSCANNER CAM ADOBE LENS OFFICE MICROSOFT TEAMS DOC DOCS DOCUMENT DOCUMENTS
  IMG IMAGE IMAGES PHOTO PHOTOS PIC PICS PICTURE DSC DCIM PXL VID WHATSAPP WHATS APP SCREENSHOT SCREEN SHOT
  PDF JPG JPEG PNG HEIC NEW OLD LATEST UPDATED REVISED CORRECTED CORRECT ORIGINAL DUPLICATE SIGNED RESCAN
  EDITED COMPRESSED MERGED COMBINED UNTITLED OTHER OTHERS EXTRA PART SET ALL MOBILE PHONE
  INVOICE INVOICES INV BILL BILLS TAX RECEIPT RECEIPTS RCPT PAYMENT PAYMENTS PAID PAY GPAY PAYTM PHONEPE
  ADVANCE MARGIN MONEY AMOUNT CASH UPI NEFT RTGS IMPS TRANSFER CHEQUE CHECK
  PAN AADHAR AADHAAR ADHAR ADHAAR ADDHAR UID CARD CARDS KYC FORM FORMS PROOF ADDRESS VOTER PASSPORT
  LICENCE LICENSE DRIVING POLICY INSURANCE COVER NOTE LOAN SANCTION SANCTIONED LETTER APPROVAL APPROVED
  DISBURSEMENT DISBURSAL RELEASE ORDER QUOTATION QUOTE PROFORMA ESTIMATE COST SHEET NDC LEDGER STATEMENT
  ACCOUNT GATE PASS GATEPASS GST GSTIN CERTIFICATE REGISTRATION RTO HSRP TEMP TEMPORARY PERMANENT
  ACCESSORY ACCESSORIES ADDON ADDONS EXCHANGE SCRAPPAGE CHALLAN BANK DMS TALLY DOCKET VEHICLE CAR DISCOUNT
  CORPORATE SCHEME OFFER DETAILS DETAIL FRONT BACK SIDE FINANCE FINANCED CUSTOMER CUSTOMERS SALE SALES
  PURCHASE WARRANTY EXTENDED AMC RSA SHIELD FASTAG CHECKLIST HANDOVER FEEDBACK UNDERTAKING DECLARATION
  AFFIDAVIT CONSENT AGREEMENT CONTRACT FATHER MOTHER WIFE HUSBAND SON DAUGHTER GUARDIAN NOMINEE
  APPLICANT GUARANTOR MEMO SLIP EVALUATION VALUATION CHASSIS ENGINE VIN ODOMETER KEY KEYS VIEW SELFIE
  NUMBER PLATE SIGNATURE SIGN ELECTRICITY RATION UDYAM TRADE BOARD RESOLUTION PARTNERSHIP DEED
  AUTHORIZATION AUTHORISATION DOWN BALANCE FULL REFUND CREDIT DEBIT LOYALTY REFERRAL BONUS COD PRICE LIST
  RETAIL WHOLESALE ALLOTMENT ACKNOWLEDGEMENT ACK COMBINE MOB DEALER DEALERSHIP SHOWROOM OUTLET BRANCH
  SBI HDFC ICICI AXIS BOI BOB UCO PNB CANARA UNION BANDHAN KOTAK IDFC INDUSIND FEDERAL BARODA CHOLA
  CHOLAMANDALAM SHRIRAM TATA BAJAJ MMFSL MMFL SUNDARAM HERO MUTHOOT MANAPPURAM ODISHA GRAMYA GRAMEEN UTKAL
  COOPERATIVE EQUITAS UJJIVAN LOMBARD ALLIANZ ERGO AIG INDIA UNITED ORIENTAL NATIONAL RELIANCE IFFCO
  TOKIO ROYAL GENERAL LIBERTY DIGIT ACKO GENERALI MAGMA SOMPO ZUNO NAVI
  JAN JANUARY FEB FEBRUARY MAR MARCH APR APRIL JUN JUNE JUL JULY AUG AUGUST SEP SEPT SEPTEMBER
  OCT OCTOBER NOV NOVEMBER DEC DECEMBER
  MAHINDRA XUV SCORPIO BOLERO THAR ROXX MARAZZO KUV TUV ALTURAS SUPRO JEETO PIKUP PICKUP MAXX VEERO TREO
  ZOR ALFA NEO CAMPER XEV
`.trim().split(/\s+/));

/** Parts of a name that many different customers share: kept for display,
 * left out of the comparison. */
const SHARED_NAME_PARTS = new Set(`
  MR MRS MS MISS SMT SRI SHRI SHREE SHRIMATI DR KUMAR KUMARI DEVI
  MOHD MOHAMMAD MOHAMMED MOHAMED MOHAMAD MUHAMMAD MESSRS
  AND THE FOR WITH FROM PRIVATE PVT LIMITED LTD LLP COMPANY CORPORATION CORP INC
  ENTERPRISE ENTERPRISES TRADERS TRADING INDUSTRIES AGENCY AGENCIES
`.trim().split(/\s+/));

/** The words of a text: letters only (any script), "AzizurReheman" split at the capital. */
function letterWords(text: string): string[] {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')
    .split(/[^\p{L}]+/u)
    .filter(Boolean);
}

function withoutExtension(fileName: string): string {
  return fileName.trim().replace(/\.[a-z0-9]{1,5}$/i, '');
}

/** The uppercased words of a name that can tell two people apart (three or more letters). */
export function distinguishingWords(text: string): string[] {
  const words: string[] = [];
  for (const word of letterWords(text)) {
    const upper = word.toUpperCase();
    if (upper.length < 3 || FILE_WORDS.has(upper) || SHARED_NAME_PARTS.has(upper)) continue;
    if (!words.includes(upper)) words.push(upper);
  }
  return words;
}

/** The person-name words in a file's name; empty when it names no one. */
export function fileNameWords(fileName: string): string[] {
  return distinguishingWords(withoutExtension(fileName));
}

/** A booking's customer is named once a document named them: until then it
 * carries its Journey id (or nothing) as the name. */
export function customerIsNamed(name?: string | null): boolean {
  const trimmed = (name ?? '').trim();
  return Boolean(trimmed) && !UUID.test(trimmed);
}

/** A customer name's words; none for the placeholder (the Journey id) a booking carries until a document names the customer. */
export function customerNameWords(name?: string | null): string[] {
  return customerIsNamed(name) ? distinguishingWords(name!) : [];
}

/** "Minati Das Booking .pdf" → "Minati Das"; null when the file names no one. */
export function personNameFromFileName(fileName: string): string | null {
  const base = withoutExtension(fileName);
  if (!distinguishingWords(base).length) return null;
  return letterWords(base).filter((word) => !FILE_WORDS.has(word.toUpperCase())).join(' ');
}

/** The first letter and the consonants, each run of one letter kept once:
 * REHEMAN, REHAMAN and REHMAN are all RHMN. */
function consonants(word: string): string {
  return (word[0] + word.slice(1).replace(/[AEIOUY]/g, '')).replace(/(.)\1+/g, '$1');
}

function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const ca = consonants(a);
  return ca.length >= 3 && ca === consonants(b);
}

/** Two names differ when both name someone and they share no word. */
export function namesDiffer(a: readonly string[], b: readonly string[]): boolean {
  if (!a.length || !b.length) return false;
  return !a.some((x) => b.some((y) => sameWord(x, y)));
}

/** What a booking knows about whose it is: its customer (once identified),
 * the people its files were found to belong to, and its files' names, oldest first. */
export type KnownBookingNames = {
  customerName?: string | null;
  personNames?: readonly string[];
  fileNames: readonly string[];
};

function knownWords(known: KnownBookingNames): string[] {
  return [
    ...customerNameWords(known.customerName),
    ...(known.personNames ?? []).flatMap(customerNameWords),
    ...known.fileNames.flatMap(fileNameWords),
  ];
}

/** A dropped file named after someone the booking does not know. */
export function looksLikeAnotherCustomer(fileName: string, known: KnownBookingNames): boolean {
  return namesDiffer(fileNameWords(fileName), knownWords(known));
}

/** Files that can go straight in, and files to ask about first. */
export function splitDroppedFiles<T extends { name: string }>(files: readonly T[], known: KnownBookingNames): { pass: T[]; held: T[] } {
  const words = knownWords(known);
  const pass: T[] = [];
  const held: T[] = [];
  for (const file of files) (namesDiffer(fileNameWords(file.name), words) ? held : pass).push(file);
  return { pass, held };
}

/** A name as stored, its spacing tidied. */
export function displayName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/** How the question names the booking: its customer, else its first file named after someone. */
export function bookingNameForQuestion(known: KnownBookingNames): string | null {
  if (customerNameWords(known.customerName).length) return displayName(known.customerName!);
  for (const person of known.personNames ?? []) if (customerNameWords(person).length) return displayName(person);
  for (const fileName of known.fileNames) {
    const person = personNameFromFileName(fileName);
    if (person) return person;
  }
  return null;
}

function quotedList(names: readonly string[]): string {
  const quoted = names.map((name) => `“${name}”`);
  return quoted.length < 2 ? quoted.join('') : `${quoted.slice(0, -1).join(', ')} and ${quoted.at(-1)}`;
}

/** “Tapan kumar patra.pdf” looks like a different customer from this booking
 * (Azizur Rehaman). Start a new booking with it, or add it here? -- without
 * the new-booking choice for someone who does not start bookings. */
export function differentCustomerQuestion(fileNames: readonly string[], bookingName: string | null, canStartNew = true): string {
  const one = fileNames.length === 1;
  const it = one ? 'it' : 'them';
  const from = bookingName ? `this booking (${bookingName})` : 'this booking';
  return `${quotedList(fileNames)} ${one ? 'looks' : 'look'} like a different customer from ${from}. `
    + (canStartNew ? `Start a new booking with ${it}, or add ${it} here?` : `Add ${it} here anyway?`);
}

/** The PC's answer to the different-customer question. */
export type DifferentCustomerAnswer = 'start-new' | 'add-here' | 'cancel';

/** What an answer does with the files held for it: start a new booking with
 * them, upload them into this booking, or (cancel) neither. */
export function answerDifferentCustomer<T>(
  answer: DifferentCustomerAnswer,
  files: readonly T[],
  canStartNew: boolean,
): { startNewWith: T[]; upload: T[] } {
  if (answer === 'start-new' && canStartNew) return { startNewWith: [...files], upload: [] };
  if (answer === 'add-here') return { startNewWith: [], upload: [...files] };
  return { startNewWith: [], upload: [] };
}

/**
 * The names a booking knows, from its documents read: the customer, the
 * files Audit Core says are this customer's (and the person each names), and
 * every other upload's file name, oldest first. A file Audit Core found to be
 * another person's and took out of the booking is not one of them.
 */
export function bookingKnownNames(
  documents: Pick<P2DocumentsResponse, 'batches' | 'files'> | undefined,
  customerName?: string | null,
): KnownBookingNames {
  const files = [...(documents?.files ?? [])].sort((a, b) => a.uploadedAtUtc.localeCompare(b.uploadedAtUtc));
  const foreign = new Set(files.filter((file) => file.identity?.status === 'FOREIGN').map((file) => file.batchId));
  const names: string[] = [];
  const people: string[] = [];
  for (const file of files) {
    if (foreign.has(file.batchId)) continue;
    names.push(file.fileName);
    if (file.identity?.status === 'BELONGS' && file.identity.personName) people.push(file.identity.personName);
  }
  const batches = [...(documents?.batches ?? [])].sort((a, b) => a.created_at_utc.localeCompare(b.created_at_utc));
  for (const batch of batches) {
    if (!foreign.has(batch.batchId) && batch.original_filename) names.push(batch.original_filename);
  }
  return { customerName, personNames: [...new Set(people)], fileNames: [...new Set(names)] };
}
