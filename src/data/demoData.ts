import type {
  CrmInteraction,
  CustomerSummary,
  DailyOpsRun,
  DealerSummary,
  EscalationSummary,
  EvidenceFact,
  EvidenceSummary,
  FindingSummary,
  JourneySummary,
  OutletSummary,
  ProjectSummary,
  ReviewQueueItem,
  WorkTask,
} from '../domain/models';

export const DEMO_TENANT_ID = 'TENANT-DEMO';
export const DEMO_DEALER_ID = '11111111-1111-4111-8111-111111111111';
export const DEMO_OUTLET_ID = '22222222-2222-4222-8222-222222222222';

export const demoProject: ProjectSummary = {
  tenantId: DEMO_TENANT_ID,
  projectCode: 'VER-DEMO',
  projectName: 'North Region Audit Programme',
};

export const demoDealers: DealerSummary[] = [
  {
    dealerId: DEMO_DEALER_ID,
    dealerCode: 'DLR-NORTH-01',
    dealerName: 'Northstar Motors',
    legalName: 'Northstar Automotive Pvt Ltd',
    status: 'ACTIVE',
  },
  {
    dealerId: '11111111-1111-4111-8111-111111111112',
    dealerCode: 'DLR-NORTH-02',
    dealerName: 'Metro Wheels',
    legalName: 'Metro Wheels Pvt Ltd',
    status: 'ACTIVE',
  },
];

export const demoOutlets: OutletSummary[] = [
  {
    outletId: DEMO_OUTLET_ID,
    dealerId: DEMO_DEALER_ID,
    outletCode: 'CHD-01',
    outletName: 'Chandigarh Central',
    outletClassification: 'ONSITE',
    city: 'Chandigarh',
    stateRegion: 'Chandigarh',
    postalCode: '160017',
    status: 'ACTIVE',
  },
  {
    outletId: '22222222-2222-4222-8222-222222222223',
    dealerId: DEMO_DEALER_ID,
    outletCode: 'MOH-01',
    outletName: 'Mohali Airport Road',
    outletClassification: 'SATELLITE',
    city: 'Mohali',
    stateRegion: 'Punjab',
    postalCode: '140306',
    status: 'ACTIVE',
  },
];

export const demoCustomers: CustomerSummary[] = [
  {
    customerId: '30000000-0000-4000-8000-000000000001',
    displayName: 'Aarav Mehta',
    mobileLast4: '4821',
    emailReference: 'aarav.m@example.test',
    externalCustomerRef: 'DMS-C-10482',
    status: 'ACTIVE',
    outletId: DEMO_OUTLET_ID,
    dealerId: DEMO_DEALER_ID,
  },
  {
    customerId: '30000000-0000-4000-8000-000000000002',
    displayName: 'Meera Kapoor',
    mobileLast4: '7734',
    emailReference: 'meera.k@example.test',
    externalCustomerRef: 'DMS-C-10491',
    status: 'ACTIVE',
    outletId: DEMO_OUTLET_ID,
    dealerId: DEMO_DEALER_ID,
  },
  {
    customerId: '30000000-0000-4000-8000-000000000003',
    displayName: 'Kabir Singh',
    mobileLast4: '9920',
    emailReference: 'kabir.s@example.test',
    externalCustomerRef: 'DMS-C-10507',
    status: 'ACTIVE',
    outletId: '22222222-2222-4222-8222-222222222223',
    dealerId: DEMO_DEALER_ID,
  },
];

export const demoJourneys: JourneySummary[] = [
  {
    journeyId: '40000000-0000-4000-8000-000000000001',
    customerId: demoCustomers[0].customerId,
    customerName: demoCustomers[0].displayName,
    journeyReference: 'JRN-2026-0817-001',
    bookingReference: 'BK-581204',
    productLabel: 'Aster ZX · Deep Blue',
    outletName: 'Chandigarh Central',
    dealerName: 'Northstar Motors',
    auditState: 'IN_PROGRESS',
    auditOutcome: 'PENDING',
    observedStatusCode: 'BOOKED',
    actualDeliveryStatusCode: null,
    evidenceCount: 6,
    findingCount: 1,
    updatedAt: '2026-08-17T08:35:00Z',
  },
  {
    journeyId: '40000000-0000-4000-8000-000000000002',
    customerId: demoCustomers[1].customerId,
    customerName: demoCustomers[1].displayName,
    journeyReference: 'JRN-2026-0816-014',
    bookingReference: 'BK-580944',
    productLabel: 'Aster VX · Pearl White',
    outletName: 'Chandigarh Central',
    dealerName: 'Northstar Motors',
    auditState: 'PC_SUBMITTED',
    auditOutcome: 'PENDING',
    observedStatusCode: 'READY_FOR_DELIVERY',
    actualDeliveryStatusCode: 'READY',
    evidenceCount: 11,
    findingCount: 2,
    updatedAt: '2026-08-17T07:20:00Z',
  },
  {
    journeyId: '40000000-0000-4000-8000-000000000003',
    customerId: demoCustomers[2].customerId,
    customerName: demoCustomers[2].displayName,
    journeyReference: 'JRN-2026-0815-008',
    bookingReference: 'BK-579118',
    productLabel: 'Nova AX · Graphite',
    outletName: 'Mohali Airport Road',
    dealerName: 'Northstar Motors',
    auditState: 'TL_REVIEW',
    auditOutcome: 'PENDING',
    observedStatusCode: 'DELIVERED',
    actualDeliveryStatusCode: 'DELIVERED',
    evidenceCount: 13,
    findingCount: 3,
    updatedAt: '2026-08-17T06:54:00Z',
  },
  {
    journeyId: '40000000-0000-4000-8000-000000000004',
    customerId: demoCustomers[0].customerId,
    customerName: demoCustomers[0].displayName,
    journeyReference: 'JRN-2026-0814-027',
    bookingReference: 'BK-578220',
    productLabel: 'Nova SX · Silver',
    outletName: 'Chandigarh Central',
    dealerName: 'Northstar Motors',
    auditState: 'COMPLETED',
    auditOutcome: 'NO_BREACH',
    observedStatusCode: 'DELIVERED',
    actualDeliveryStatusCode: 'DELIVERED',
    evidenceCount: 14,
    findingCount: 0,
    updatedAt: '2026-08-16T16:15:00Z',
  },
  {
    journeyId: '40000000-0000-4000-8000-000000000005',
    customerId: demoCustomers[1].customerId,
    customerName: demoCustomers[1].displayName,
    journeyReference: 'JRN-2026-0813-021',
    bookingReference: 'BK-577640',
    productLabel: 'Aster ZX · Black',
    outletName: 'Chandigarh Central',
    dealerName: 'Northstar Motors',
    auditState: 'SENT_BACK',
    auditOutcome: 'PENDING',
    observedStatusCode: 'BOOKED',
    actualDeliveryStatusCode: null,
    evidenceCount: 4,
    findingCount: 1,
    updatedAt: '2026-08-16T14:10:00Z',
  },
];

const evidenceSeed: Record<string, EvidenceSummary[]> = {
  [demoJourneys[0].journeyId]: [
    ['50000000-0000-4000-8000-000000000001', 'BOOKING_DOCKET', 'BOOKING', 'READY', 'NOT_VERIFIED', 'booking-docket.pdf'],
    ['50000000-0000-4000-8000-000000000002', 'PAN', 'CUSTOMER_KYC', 'READY', 'VERIFIED', 'pan-card.jpg'],
    ['50000000-0000-4000-8000-000000000003', 'AADHAAR', 'CUSTOMER_KYC', 'READY', 'VERIFIED', 'aadhaar-front.jpg'],
    ['50000000-0000-4000-8000-000000000004', 'PAYMENT_RECEIPT', 'PAYMENT', 'READY', 'NOT_VERIFIED', 'payment-receipt.pdf'],
    ['50000000-0000-4000-8000-000000000005', 'INSURANCE_COVER_NOTE', 'INSURANCE', 'PROCESSING', null, 'cover-note.pdf'],
    ['50000000-0000-4000-8000-000000000006', 'PRICE_APPROVAL', 'COMMERCIAL', 'READY', 'REVIEW_REQUIRED', 'discount-approval.png'],
  ].map(([id, type, purpose, processing, verification, filename], index) => ({
    evidenceId: id as string,
    journeyId: demoJourneys[0].journeyId,
    documentTypeKey: type as string,
    evidencePurpose: purpose as string,
    processingStatus: processing as string,
    verificationStatus: verification as string | null,
    createdAtUtc: `2026-08-17T0${Math.min(8, index + 2)}:1${index}:00Z`,
    filename: filename as string,
    sourceLabel: 'Uploaded evidence',
  })),
};

for (const journey of demoJourneys.slice(1)) {
  evidenceSeed[journey.journeyId] = Array.from({ length: Math.min(journey.evidenceCount, 6) }, (_, index) => ({
    evidenceId: `50000000-0000-4000-8${String(index).padStart(3, '0')}-${journey.journeyId.slice(-12)}`,
    journeyId: journey.journeyId,
    documentTypeKey: ['BOOKING_DOCKET', 'PAN', 'PAYMENT_RECEIPT', 'INSURANCE_COVER_NOTE', 'INVOICE', 'DELIVERY_NOTE'][index],
    evidencePurpose: ['BOOKING', 'CUSTOMER_KYC', 'PAYMENT', 'INSURANCE', 'COMMERCIAL', 'DELIVERY'][index],
    processingStatus: 'READY',
    verificationStatus: index % 3 === 0 ? 'REVIEW_REQUIRED' : 'VERIFIED',
    createdAtUtc: `2026-08-16T${String(9 + index).padStart(2, '0')}:20:00Z`,
    filename: `evidence-${index + 1}.pdf`,
    sourceLabel: 'Uploaded evidence',
  }));
}

export const demoEvidenceByJourney = evidenceSeed;

export const demoEvidenceFacts: Record<string, EvidenceFact[]> = {
  '50000000-0000-4000-8000-000000000001': [
    {
      evidenceFactId: '60000000-0000-4000-8000-000000000001',
      fieldKey: 'booking.reference',
      valueType: 'TEXT',
      value: 'BK-581204',
      normalizedValue: 'BK-581204',
      confidenceScore: 0.99,
      verificationStatus: 'VERIFIED',
      source: 'Booking docket',
    },
    {
      evidenceFactId: '60000000-0000-4000-8000-000000000002',
      fieldKey: 'customer.name',
      valueType: 'TEXT',
      value: 'Aarav Mehta',
      normalizedValue: 'AARAV MEHTA',
      confidenceScore: 0.97,
      verificationStatus: 'VERIFIED',
      source: 'Booking docket',
    },
    {
      evidenceFactId: '60000000-0000-4000-8000-000000000003',
      fieldKey: 'vehicle.variant',
      valueType: 'TEXT',
      value: 'Aster ZX',
      normalizedValue: 'ASTER ZX',
      confidenceScore: 0.96,
      verificationStatus: 'VERIFIED',
      source: 'Booking docket',
    },
    {
      evidenceFactId: '60000000-0000-4000-8000-000000000004',
      fieldKey: 'commercial.discount',
      valueType: 'NUMBER',
      value: 45000,
      normalizedValue: '45000',
      confidenceScore: 0.78,
      verificationStatus: 'REVIEW_REQUIRED',
      source: 'Booking docket',
    },
  ],
};

export const demoFindings: FindingSummary[] = [
  {
    auditFindingId: '70000000-0000-4000-8000-000000000001',
    journeyId: demoJourneys[0].journeyId,
    journeyReference: demoJourneys[0].journeyReference!,
    severity: 'MEDIUM',
    findingStatus: 'OPEN',
    title: 'Discount approval evidence requires review',
    description: 'Observed discount is above the configured frontline approval threshold.',
    expectedSummary: 'Approval evidence from an authorized level is required.',
    observedSummary: 'Uploaded screenshot does not expose approver identity clearly.',
  },
  {
    auditFindingId: '70000000-0000-4000-8000-000000000002',
    journeyId: demoJourneys[1].journeyId,
    journeyReference: demoJourneys[1].journeyReference!,
    severity: 'HIGH',
    findingStatus: 'OPEN',
    title: 'Payment timestamp occurs after invoice issue',
    description: 'Sequence requires TL validation against original payment evidence.',
    expectedSummary: 'Payment should be evidenced before invoice completion.',
    observedSummary: 'Receipt timestamp appears 42 minutes after invoice timestamp.',
  },
  {
    auditFindingId: '70000000-0000-4000-8000-000000000003',
    journeyId: demoJourneys[2].journeyId,
    journeyReference: demoJourneys[2].journeyReference!,
    severity: 'CRITICAL',
    findingStatus: 'ACKNOWLEDGED',
    title: 'Delivery evidence and system status mismatch',
    description: 'DMS shows delivered while signed delivery note timestamp differs.',
  },
];

export const demoTasks: WorkTask[] = [
  {
    taskId: '80000000-0000-4000-8000-000000000001',
    taskType: 'TL_REVIEW',
    status: 'OPEN',
    dueAtUtc: '2026-08-17T11:30:00Z',
    assignedRole: 'TL',
    journeyId: demoJourneys[1].journeyId,
    journeyReference: demoJourneys[1].journeyReference!,
    customerName: demoJourneys[1].customerName,
    outletName: demoJourneys[1].outletName,
  },
  {
    taskId: '80000000-0000-4000-8000-000000000002',
    taskType: 'PM_REVIEW',
    status: 'OPEN',
    dueAtUtc: '2026-08-17T12:45:00Z',
    assignedRole: 'PM',
    journeyId: demoJourneys[2].journeyId,
    journeyReference: demoJourneys[2].journeyReference!,
    customerName: demoJourneys[2].customerName,
    outletName: demoJourneys[2].outletName,
  },
  {
    taskId: '80000000-0000-4000-8000-000000000003',
    taskType: 'EVIDENCE_FOLLOWUP',
    status: 'IN_PROGRESS',
    dueAtUtc: '2026-08-17T14:00:00Z',
    assignedRole: 'PC',
    journeyId: demoJourneys[0].journeyId,
    journeyReference: demoJourneys[0].journeyReference!,
    customerName: demoJourneys[0].customerName,
    outletName: demoJourneys[0].outletName,
  },
];

export const demoReviews: ReviewQueueItem[] = [
  {
    taskId: demoTasks[0].taskId,
    journeyId: demoJourneys[1].journeyId,
    journeyReference: demoJourneys[1].journeyReference!,
    customerName: demoJourneys[1].customerName,
    outletName: demoJourneys[1].outletName,
    submittedAt: '2026-08-17T07:20:00Z',
    severity: 'HIGH',
    evidenceCount: 11,
    exceptionCount: 2,
    assignedRole: 'TL',
  },
  {
    taskId: demoTasks[1].taskId,
    journeyId: demoJourneys[2].journeyId,
    journeyReference: demoJourneys[2].journeyReference!,
    customerName: demoJourneys[2].customerName,
    outletName: demoJourneys[2].outletName,
    submittedAt: '2026-08-17T06:54:00Z',
    severity: 'CRITICAL',
    evidenceCount: 13,
    exceptionCount: 3,
    assignedRole: 'PM',
  },
];

export const demoDailyOps: DailyOpsRun[] = [
  {
    runId: '90000000-0000-4000-8000-000000000001',
    outletId: DEMO_OUTLET_ID,
    outletName: 'Chandigarh Central',
    businessDate: '2026-08-17',
    pcActorId: 'pc-demo',
    status: 'IN_PROGRESS',
    startedAtUtc: '2026-08-17T03:45:00Z',
    completedAtUtc: null,
  },
  {
    runId: '90000000-0000-4000-8000-000000000002',
    outletId: DEMO_OUTLET_ID,
    outletName: 'Chandigarh Central',
    businessDate: '2026-08-16',
    pcActorId: 'pc-demo',
    status: 'COMPLETED',
    startedAtUtc: '2026-08-16T03:35:00Z',
    completedAtUtc: '2026-08-16T13:02:00Z',
  },
];

export const demoCrmInteractions: CrmInteraction[] = [
  {
    crmInteractionId: 'a0000000-0000-4000-8000-000000000001',
    journeyId: demoJourneys[2].journeyId,
    journeyReference: demoJourneys[2].journeyReference!,
    customerName: demoJourneys[2].customerName,
    interactionType: 'POST_DELIVERY_CONFIRMATION',
    interactionStatus: 'PENDING',
    outcomeCode: null,
    notes: 'Confirm delivery experience after audit exception closure.',
  },
  {
    crmInteractionId: 'a0000000-0000-4000-8000-000000000002',
    journeyId: demoJourneys[4].journeyId,
    journeyReference: demoJourneys[4].journeyReference!,
    customerName: demoJourneys[4].customerName,
    interactionType: 'DOCUMENT_FOLLOWUP',
    interactionStatus: 'OPEN',
    outcomeCode: null,
    notes: 'Customer consent evidence missing from the current packet.',
  },
];

export const demoEscalations: EscalationSummary[] = [
  {
    escalationId: 'b0000000-0000-4000-8000-000000000001',
    journeyId: demoJourneys[2].journeyId,
    journeyReference: demoJourneys[2].journeyReference!,
    escalationType: 'DELIVERY_MISMATCH',
    severity: 'CRITICAL',
    status: 'OPEN',
    assignedRoleCode: 'PM',
    summary: 'Delivery status conflict requires PM disposition.',
    openedAtUtc: '2026-08-17T06:58:00Z',
  },
  {
    escalationId: 'b0000000-0000-4000-8000-000000000002',
    journeyId: demoJourneys[1].journeyId,
    journeyReference: demoJourneys[1].journeyReference!,
    escalationType: 'PAYMENT_SEQUENCE',
    severity: 'HIGH',
    status: 'OPEN',
    assignedRoleCode: 'TL',
    summary: 'Payment and invoice sequence needs review.',
    openedAtUtc: '2026-08-17T07:30:00Z',
  },
];

export const demoStageData: Record<string, Record<string, Record<string, unknown> | null>> = {
  [demoJourneys[0].journeyId]: {
    booking: {
      bookingReference: 'BK-581204',
      bookingDate: '2026-08-15',
      salesConsultant: 'R. Khanna',
      model: 'Aster',
      variant: 'ZX',
      colour: 'Deep Blue',
      source: 'BOOKING_DOCKET',
    },
    commercials: {
      exShowroom: 1825000,
      insurance: 62450,
      accessories: 28900,
      discount: 45000,
      netInvoice: 1871350,
      source: 'BOOKING_DOCKET + PRICE_APPROVAL',
    },
    payment: {
      totalReceived: 50000,
      currencyCode: 'INR',
      paymentMethod: 'UPI',
      paymentReference: 'UPI-884231',
      actualStatusCode: 'RECEIVED',
      source: 'PAYMENT_RECEIPT',
    },
    finance: {
      financeTypeCode: 'RETAIL_LOAN',
      providerName: 'Example Bank',
      financedAmount: 1500000,
      actualStatusCode: 'SANCTIONED',
      source: 'FINANCE_DO',
    },
    insurance: {
      insurerName: 'Example General Insurance',
      coverNoteReference: 'CN-88402',
      actualPremiumAmount: 62450,
      actualStatusCode: 'COVER_NOTE_ISSUED',
      source: 'INSURANCE_COVER_NOTE',
    },
    tradeIn: null,
    vehicle: {
      vin: 'MA3DEMO0000001842',
      chassisNumber: 'CH-DEMO-1842',
      invoiceReference: 'INV-261884',
      source: 'DMS_SCREENSHOT',
    },
    registration: {
      registrationState: 'Chandigarh',
      registrationNumber: 'CH01DE1842',
      actualStatusCode: 'REGISTERED',
      source: 'REGISTRATION_RECEIPT',
    },
    delivery: {
      plannedDeliveryAt: '2026-08-20T06:30:00Z',
      actualDeliveryStatusCode: 'READY',
      statusLabel: 'Ready for Delivery',
      source: 'DMS_SCREENSHOT',
    },
    review: {
      auditState: 'IN_PROGRESS',
      auditOutcome: 'PENDING',
    },
  },
};

for (const journey of demoJourneys.slice(1)) {
  demoStageData[journey.journeyId] = {
    booking: {
      bookingReference: journey.bookingReference,
      model: journey.productLabel,
      source: 'BOOKING_DOCKET',
    },
    commercials: { source: 'PRICE_SHEET + APPROVAL_EVIDENCE' },
    payment: { actualStatusCode: 'RECEIVED', source: 'PAYMENT_RECEIPT' },
    finance: { actualStatusCode: 'APPROVED', source: 'FINANCE_DOCUMENT' },
    insurance: { actualStatusCode: 'ISSUED', source: 'INSURANCE_COVER_NOTE' },
    tradeIn: null,
    vehicle: { source: 'DMS_SCREENSHOT' },
    registration: { actualStatusCode: 'REGISTERED', source: 'REGISTRATION_RECEIPT' },
    delivery: { actualDeliveryStatusCode: journey.actualDeliveryStatusCode, source: 'DMS_SCREENSHOT' },
    review: { auditState: journey.auditState, auditOutcome: journey.auditOutcome },
  };
}
