export type ConfigurationField = {
  fieldKey: string;
  displayName: string;
  dataType: 'STRING' | 'INTEGER' | 'DECIMAL' | 'BOOLEAN' | 'DATE' | 'DATETIME' | 'CURRENCY' | 'IDENTIFIER' | 'PHONE' | 'EMAIL' | 'JSON';
  required: boolean;
  evidenceLabels: string[];
  aliases: string[];
  extractionInstruction: string;
  description?: string | null;
  scoreIncluded: boolean;
  scoreWeight: number;
  derived: false;
};

export type ConfigurationProposalBody = {
  documentTypeKey: string;
  displayName: string;
  description?: string | null;
  physicalFormType: 'GOVT_ID' | 'PRINTABLE' | 'HANDWRITTEN' | 'ADDITIONAL';
  fields: ConfigurationField[];
  warnings: string[];
  authoringPolicy?: {
    manualApprovalRequired: boolean;
    directDatabaseWriteByModel: boolean;
    derivedFieldsAllowed: boolean;
    missingValuesMustBeNull: boolean;
  };
};

export type ProposalTestField = {
  fieldKey: string;
  foundStatus: string;
  value: unknown;
  confidence: number | null;
  pageNo: number | null;
};

export type ProposalTestResult = {
  documentTypeKey: string;
  fields: ProposalTestField[];
  usage?: Record<string, unknown>;
  providerRequestId?: string | null;
  persistedAsBusinessEvidence: false;
};

export type ConfigurationProposal = {
  proposalId: string;
  status: 'PROPOSED' | 'DRAFT' | 'TESTED' | 'APPROVED' | 'PUBLISHED' | 'RETIRED' | 'REJECTED';
  sampleFilename: string;
  sampleMimeType: string;
  sampleSizeBytes: number;
  documentTypeKey: string;
  displayName: string;
  physicalFormType: string;
  generatedByModel?: string | null;
  promptTokens?: number;
  responseTokens?: number;
  materializedDocumentTypeId?: string | null;
  materializedProfileId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  approvedAt?: string | null;
  publishedAt?: string | null;
  proposal?: ConfigurationProposalBody;
  latestTestResult?: ProposalTestResult | null;
};

type ApiEnvelope<T> = {
  errorCode?: string | null;
  errorMessage?: string | null;
  data?: T | null;
  detail?: unknown;
  code?: string;
  title?: string;
};

const DI_BASE = '/di';

function authHeaders(accessToken: string, json = false): HeadersInit {
  const result: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
  if (json) result['Content-Type'] = 'application/json';
  return result;
}

function problemText(payload: ApiEnvelope<unknown>, status: number): string {
  if (typeof payload.detail === 'string') return payload.detail;
  if (payload.errorMessage) return payload.errorMessage;
  if (payload.title) return payload.title;
  if (payload.code) return payload.code;
  return `DI request failed (HTTP ${status})`;
}

async function unwrap<T>(response: Response, operation: string): Promise<T> {
  let payload: ApiEnvelope<T>;
  try {
    payload = await response.json() as ApiEnvelope<T>;
  } catch {
    throw new Error(`${operation} returned non-JSON HTTP ${response.status}.`);
  }
  if (!response.ok || (payload.errorCode && payload.errorCode !== '000')) {
    throw new Error(`${operation}: ${problemText(payload, response.status)}`);
  }
  if (payload.data === undefined || payload.data === null) throw new Error(`${operation} returned no data.`);
  return payload.data;
}

function proposalPath(tenantId: string, proposalId?: string): string {
  const base = `${DI_BASE}/v1/tenants/${encodeURIComponent(tenantId)}/configuration-proposals`;
  return proposalId ? `${base}/${encodeURIComponent(proposalId)}` : base;
}

export async function createConfigurationProposal(
  tenantId: string,
  accessToken: string,
  file: File,
  displayName: string,
  description: string,
): Promise<ConfigurationProposal> {
  const form = new FormData();
  form.append('file', file, file.name);
  if (displayName.trim()) form.append('displayName', displayName.trim());
  if (description.trim()) form.append('description', description.trim());
  const response = await fetch(proposalPath(tenantId), {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: form,
  });
  return unwrap<ConfigurationProposal>(response, 'Generate DI configuration proposal');
}

export async function listConfigurationProposals(tenantId: string, accessToken: string): Promise<ConfigurationProposal[]> {
  const response = await fetch(proposalPath(tenantId), { headers: authHeaders(accessToken), cache: 'no-store' });
  return unwrap<ConfigurationProposal[]>(response, 'List DI configuration proposals');
}

export async function getConfigurationProposal(tenantId: string, proposalId: string, accessToken: string): Promise<ConfigurationProposal> {
  const response = await fetch(proposalPath(tenantId, proposalId), { headers: authHeaders(accessToken), cache: 'no-store' });
  return unwrap<ConfigurationProposal>(response, 'Get DI configuration proposal');
}

export async function updateConfigurationProposal(
  tenantId: string,
  proposalId: string,
  accessToken: string,
  proposal: ConfigurationProposalBody,
): Promise<ConfigurationProposal> {
  const response = await fetch(proposalPath(tenantId, proposalId), {
    method: 'PUT',
    headers: authHeaders(accessToken, true),
    body: JSON.stringify({ proposal }),
  });
  return unwrap<ConfigurationProposal>(response, 'Save DI configuration proposal');
}

async function transition(
  tenantId: string,
  proposalId: string,
  accessToken: string,
  action: 'test' | 'approve' | 'publish' | 'retire',
): Promise<ConfigurationProposal> {
  const response = await fetch(`${proposalPath(tenantId, proposalId)}/${action}`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
  return unwrap<ConfigurationProposal>(response, `${action[0].toUpperCase()}${action.slice(1)} DI configuration proposal`);
}

export const testConfigurationProposal = (tenantId: string, proposalId: string, accessToken: string) =>
  transition(tenantId, proposalId, accessToken, 'test');
export const approveConfigurationProposal = (tenantId: string, proposalId: string, accessToken: string) =>
  transition(tenantId, proposalId, accessToken, 'approve');
export const publishConfigurationProposal = (tenantId: string, proposalId: string, accessToken: string) =>
  transition(tenantId, proposalId, accessToken, 'publish');
export const retireConfigurationProposal = (tenantId: string, proposalId: string, accessToken: string) =>
  transition(tenantId, proposalId, accessToken, 'retire');
