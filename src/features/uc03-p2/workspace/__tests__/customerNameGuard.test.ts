import { describe, expect, it } from 'vitest';

import type { P2DocumentBatch, P2JourneyFile } from '../../../../services/audit-core/uc03P2';
import {
  answerDifferentCustomer,
  bookingKnownNames,
  bookingNameForQuestion,
  customerIsNamed,
  customerNameWords,
  differentCustomerQuestion,
  fileNameWords,
  looksLikeAnotherCustomer,
  namesDiffer,
  personNameFromFileName,
  splitDroppedFiles,
} from '../customerNameGuard';

const differ = (fileName: string, known: string) => namesDiffer(fileNameWords(fileName), fileNameWords(known));

describe('a dropped file named after a different customer (2026-10-31)', () => {
  it('tells two customers apart by their files', () => {
    expect(differ('Tapan kumar patra.pdf', 'Azizur Reheman.pdf')).toBe(true);
    expect(looksLikeAnotherCustomer('Tapan kumar patra.pdf', { fileNames: ['Azizur Reheman.pdf'] })).toBe(true);
    // Kumar is shared by too many customers to say they are the same person.
    expect(differ('Tapan kumar patra.pdf', 'Prasana kumar senapati.pdf')).toBe(true);
  });

  it('knows the customer named from the documents in a file named after them', () => {
    expect(fileNameWords('Minati Das Booking .pdf')).toEqual(['MINATI', 'DAS']);
    expect(looksLikeAnotherCustomer('Minati Das Booking .pdf', { customerName: 'MINATI DAS', fileNames: [] })).toBe(false);
    expect(looksLikeAnotherCustomer('Azizur Reheman delivery.pdf', { customerName: 'AZIZUR REHAMAN', fileNames: [] })).toBe(false);
    // a spelling variant is the same word (same consonants)
    expect(looksLikeAnotherCustomer('Rehaman.pdf', { customerName: 'MD REHMAN', fileNames: [] })).toBe(false);
    expect(looksLikeAnotherCustomer('Prasanna Senapati.pdf', { fileNames: ['Prasana kumar senapati (1).pdf'] })).toBe(false);
    // one shared word is enough
    expect(looksLikeAnotherCustomer('Azizur.pdf', { fileNames: ['Azizur Reheman.pdf'] })).toBe(false);
    expect(looksLikeAnotherCustomer('AzizurReheman_PAN.jpg', { fileNames: ['Azizur Reheman.pdf'] })).toBe(false);
  });

  it('asks about a person against a firm, though the firm may be theirs: it is only a question', () => {
    expect(fileNameWords('Prasana kumar senapati (1).pdf')).toEqual(['PRASANA', 'SENAPATI']);
    expect(fileNameWords('Jagannath Power And Infra Private Limited Booking .pdf')).toEqual(['JAGANNATH', 'POWER', 'INFRA']);
    expect(differ('Prasana kumar senapati (1).pdf', 'Jagannath Power And Infra Private Limited Booking .pdf')).toBe(true);
    // ... and lets it through once the booking knows the proprietor
    expect(looksLikeAnotherCustomer('Prasana kumar senapati (1).pdf', {
      customerName: 'PRASANA KUMAR SENAPATI', fileNames: ['Jagannath Power And Infra Private Limited Booking .pdf'],
    })).toBe(false);
  });

  it('never asks about a file that names no one', () => {
    for (const name of ['IMG_20261019_120541.jpg', 'scan001.pdf', 'Scanned_20261019.pdf', 'WhatsApp Image 2026-10-19 at 12.05.41.jpeg',
      'CamScanner 10-19-2026 12.05.pdf', 'Doc1.pdf', 'invoice.pdf', 'PAN card.jpg', 'Aadhar front.jpg', 'Booking (1).pdf',
      'delivery files final copy.pdf', 'photos-202610311205.pdf', 'Tax Invoice 31 Oct.pdf', 'Insurance policy.pdf', 'XUV700 quotation.pdf',
      'SBI loan sanction letter.pdf', 'Disbursement memo.pdf', 'Number plate.jpg', 'Father PAN.jpg']) {
      expect(fileNameWords(name), name).toEqual([]);
      expect(personNameFromFileName(name), name).toBeNull();
      expect(looksLikeAnotherCustomer(name, { customerName: 'AZIZUR REHAMAN', fileNames: ['Azizur Reheman.pdf'] }), name).toBe(false);
    }
  });

  it('compares only once the booking knows someone', () => {
    expect(looksLikeAnotherCustomer('Tapan kumar patra.pdf', { fileNames: [] })).toBe(false);
    expect(looksLikeAnotherCustomer('Tapan kumar patra.pdf', { fileNames: ['IMG_20261019_120541.jpg'] })).toBe(false);
    // the placeholder a booking carries until the customer is named (its Journey id)
    const placeholder = '0b7a94e8-6c1d-4f2a-9b3e-5d6f7a8b9c0d';
    expect(customerIsNamed(placeholder)).toBe(false);
    expect(customerNameWords(placeholder)).toEqual([]);
    expect(looksLikeAnotherCustomer('Tapan kumar patra.pdf', { customerName: placeholder, fileNames: [] })).toBe(false);
    expect(customerIsNamed('MINATI DAS')).toBe(true);
  });

  it('holds back only the files that look like someone else', () => {
    const files = ['Tapan kumar patra.pdf', 'Azizur Reheman delivery.pdf', 'IMG_20261019_120541.jpg'].map((name) => ({ name }));
    const { pass, held } = splitDroppedFiles(files, { customerName: 'AZIZUR REHAMAN', fileNames: ['Azizur Reheman.pdf'] });
    expect(pass.map((file) => file.name)).toEqual(['Azizur Reheman delivery.pdf', 'IMG_20261019_120541.jpg']);
    expect(held.map((file) => file.name)).toEqual(['Tapan kumar patra.pdf']);
  });

  it('asks in plain words, naming the booking by its customer or its first file', () => {
    expect(differentCustomerQuestion(['Tapan kumar patra.pdf'], 'Azizur Rehaman')).toBe(
      '“Tapan kumar patra.pdf” looks like a different customer from this booking (Azizur Rehaman). Start a new booking with it, or add it here?');
    expect(differentCustomerQuestion(['a b c.pdf', 'Tapan.pdf'], 'X')).toBe(
      '“a b c.pdf” and “Tapan.pdf” look like a different customer from this booking (X). Start a new booking with them, or add them here?');
    expect(differentCustomerQuestion(['Tapan.pdf'], 'X', false)).toBe(
      '“Tapan.pdf” looks like a different customer from this booking (X). Add it here anyway?');
    expect(bookingNameForQuestion({ customerName: ' AZIZUR  REHAMAN ', fileNames: ['x.pdf'] })).toBe('AZIZUR REHAMAN');
    expect(bookingNameForQuestion({ fileNames: ['IMG_1.jpg', 'Azizur Reheman Booking.pdf'] })).toBe('Azizur Reheman');
    expect(bookingNameForQuestion({ fileNames: ['IMG_1.jpg'] })).toBeNull();
  });

  it('does what the PC chose with the held files', () => {
    const held = [{ name: 'Tapan kumar patra.pdf' }];
    expect(answerDifferentCustomer('start-new', held, true)).toEqual({ startNewWith: held, upload: [] });
    expect(answerDifferentCustomer('add-here', held, true)).toEqual({ startNewWith: [], upload: held });
    expect(answerDifferentCustomer('cancel', held, false)).toEqual({ startNewWith: [], upload: [] });
    // someone who does not start bookings is never sent to a new one
    expect(answerDifferentCustomer('start-new', held, false)).toEqual({ startNewWith: [], upload: [] });
  });
});

describe('the names a booking knows, from its documents read', () => {
  const batch = (batchId: string, name: string, at: string) =>
    ({ batchId, original_filename: name, created_at_utc: at }) as P2DocumentBatch;
  const file = (batchId: string, fileName: string, status: P2JourneyFile['identity']['status'], personName?: string): P2JourneyFile => ({
    batchId, fileName, uploadedAtUtc: `2026-10-31T10:0${batchId.slice(1)}:00Z`, identity: { status, personName },
  });

  it('works from the uploads alone (an Audit Core without the files list)', () => {
    const known = bookingKnownNames({ batches: [batch('b2', 'Second.pdf', '2026-10-31T10:02:00Z'), batch('b1', 'Azizur Reheman.pdf', '2026-10-31T10:01:00Z')] }, null);
    expect(known.fileNames).toEqual(['Azizur Reheman.pdf', 'Second.pdf']);
    expect(bookingKnownNames(undefined, undefined)).toEqual({ customerName: undefined, personNames: [], fileNames: [] });
  });

  it('leaves out a file found to be another person\'s, and adds the person a file was found to belong to', () => {
    const known = bookingKnownNames({
      batches: [batch('b1', 'Azizur Reheman.pdf', '2026-10-31T10:01:00Z'), batch('b2', 'Tapan kumar patra.pdf', '2026-10-31T10:02:00Z')],
      files: [file('b2', 'Tapan kumar patra.pdf', 'FOREIGN', 'TAPAN KUMAR PATRA'), file('b1', 'Azizur Reheman.pdf', 'BELONGS', 'AZIZUR REHAMAN')],
    }, 'AZIZUR REHAMAN');
    expect(known.fileNames).toEqual(['Azizur Reheman.pdf']);
    expect(known.personNames).toEqual(['AZIZUR REHAMAN']);
    // the next of Tapan's files is still asked about
    expect(looksLikeAnotherCustomer('Tapan kumar patra delivery.pdf', known)).toBe(true);
  });
});
