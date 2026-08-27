import { ensureCorrelationHeader } from '../../observability/correlation';
import {
  getPcBookingDocumentContent,
  getPcBookingDocumentContentUrl,
  type PcBookingContentAccess,
} from './bookingDocuments';

const DEFAULT_DI_BASE_URL = 'https://di-api-dev.up.railway.app';
const configuredBaseUrl = (
  import.meta.env.VITE_DI_BASE_URL?.trim()
  || import.meta.env.VITE_DI_TEST_BASE_URL?.trim()
  || DEFAULT_DI_BASE_URL
).replace(/\/$/, '');

const DIRECT_STORAGE_DISABLED_KEY = 'uc03-direct-r2-disabled-v1';
const DIRECT_STORAGE_PROBE_MS = 2_500;
const CONTENT_URL_SAFETY_MS = 30_000;

export interface PcBookingDocumentPreviewSource {
  directUrl: string | null;
  blob: Blob | null;
  mimeType: string;
  sourceMode: 'DIRECT_R2' | 'BLOB';
  rangeCapable: boolean;
}

type CachedContentAccess = {
  contentUrl?: string | null;
  contentUrlExpiresAtUtc?: string | null;
  mimeType?: string | null;
};

class DirectStorageHttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Direct storage probe failed with HTTP ${status}.`);
    this.name = 'DirectStorageHttpError';
    this.status = status;
  }
}

function token(accessToken?: string): string {
  const value = accessToken?.trim();
  if (!value) throw new Error('A Security human access token is required.');
  return value;
}

function contextBase(tenantId: string, externalContextRef: string): string {
  return `${configuredBaseUrl}/v1/tenants/${encodeURIComponent(tenantId)}`
    + `/audit-storage-contexts/${encodeURIComponent(externalContextRef)}/pc-booking-documents`;
}

function asFreshAccess(
  documentId: string,
  cached?: CachedContentAccess | null,
): PcBookingContentAccess | null {
  if (!cached?.contentUrl || !cached.contentUrlExpiresAtUtc) return null;
  const expiresAt = Date.parse(cached.contentUrlExpiresAtUtc);
  if (!Number.isFinite(expiresAt) || expiresAt - CONTENT_URL_SAFETY_MS <= Date.now()) return null;
  return {
    documentId,
    contentUrl: cached.contentUrl,
    contentUrlExpiresAtUtc: cached.contentUrlExpiresAtUtc,
    mimeType: cached.mimeType ?? null,
  };
}

function directStorageDisabled(): boolean {
  try {
    return sessionStorage.getItem(DIRECT_STORAGE_DISABLED_KEY) === '1';
  } catch {
    return false;
  }
}

function disableDirectStorageForSession(): void {
  try {
    sessionStorage.setItem(DIRECT_STORAGE_DISABLED_KEY, '1');
  } catch {
    // Session storage is only a performance hint.
  }
}

async function resolveAccess(
  tenantId: string,
  externalContextRef: string,
  documentId: string,
  accessToken: string,
  cached?: CachedContentAccess | null,
): Promise<PcBookingContentAccess> {
  return asFreshAccess(documentId, cached)
    ?? getPcBookingDocumentContentUrl(tenantId, externalContextRef, documentId, accessToken);
}

async function probeDirectPdf(url: string): Promise<{ rangeCapable: boolean }> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), DIRECT_STORAGE_PROBE_MS);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
      cache: 'no-store',
      credentials: 'omit',
      signal: controller.signal,
    });
    if (!response.ok) throw new DirectStorageHttpError(response.status);
    const rangeCapable = response.status === 206
      || response.headers.get('accept-ranges')?.toLowerCase() === 'bytes'
      || Boolean(response.headers.get('content-range'));
    try {
      await response.body?.cancel();
    } catch {
      // The one-byte probe may already be complete.
    }
    return { rangeCapable };
  } finally {
    window.clearTimeout(timeout);
  }
}

async function fetchProxyBlob(
  tenantId: string,
  externalContextRef: string,
  documentId: string,
  accessToken: string,
  mimeType?: string | null,
): Promise<PcBookingDocumentPreviewSource> {
  const headers = new Headers();
  ensureCorrelationHeader(headers);
  headers.set('Authorization', `Bearer ${token(accessToken)}`);
  const response = await fetch(
    `${contextBase(tenantId, externalContextRef)}/${encodeURIComponent(documentId)}/content`,
    {
      method: 'GET',
      headers,
      credentials: 'include',
      cache: 'no-store',
    },
  );
  if (!response.ok) {
    throw new Error(`The source document could not be read from Document Intelligence (HTTP ${response.status}).`);
  }
  return {
    directUrl: null,
    blob: await response.blob(),
    mimeType: response.headers.get('content-type') || mimeType || 'application/octet-stream',
    sourceMode: 'BLOB',
    rangeCapable: false,
  };
}

export async function getPcBookingDocumentPreviewSource(
  tenantId: string,
  externalContextRef: string,
  documentId: string,
  accessToken: string,
  cachedAccess?: CachedContentAccess | null,
): Promise<PcBookingDocumentPreviewSource> {
  let access = await resolveAccess(
    tenantId,
    externalContextRef,
    documentId,
    accessToken,
    cachedAccess,
  );
  const mimeType = access.mimeType || cachedAccess?.mimeType || 'application/octet-stream';

  // Images and other file types keep the existing proven blob path. The large
  // latency win is for PDFs, where PDF.js can use the signed R2 URL directly and
  // render the first page without waiting for the entire file to become a Blob.
  if (!mimeType.toLowerCase().includes('pdf')) {
    const content = await getPcBookingDocumentContent(
      tenantId,
      externalContextRef,
      documentId,
      accessToken,
      cachedAccess,
    );
    return {
      directUrl: null,
      blob: content.blob,
      mimeType: content.mimeType,
      sourceMode: 'BLOB',
      rangeCapable: false,
    };
  }

  if (!directStorageDisabled()) {
    try {
      try {
        const probe = await probeDirectPdf(access.contentUrl);
        return {
          directUrl: access.contentUrl,
          blob: null,
          mimeType,
          sourceMode: 'DIRECT_R2',
          rangeCapable: probe.rangeCapable,
        };
      } catch (cause) {
        if (!(cause instanceof DirectStorageHttpError) || (cause.status !== 401 && cause.status !== 403)) {
          throw cause;
        }
      }

      // The cached URL may have expired between cache validation and the probe.
      access = await getPcBookingDocumentContentUrl(
        tenantId,
        externalContextRef,
        documentId,
        accessToken,
      );
      const probe = await probeDirectPdf(access.contentUrl);
      return {
        directUrl: access.contentUrl,
        blob: null,
        mimeType: access.mimeType || mimeType,
        sourceMode: 'DIRECT_R2',
        rangeCapable: probe.rangeCapable,
      };
    } catch {
      // Firefox and mobile WebViews surface an R2 CORS block as a network error
      // with no usable HTTP status. Do not spend the same timeout on documents
      // 2-4 in this session; use the reliable DI stream immediately instead.
      disableDirectStorageForSession();
    }
  }

  return fetchProxyBlob(
    tenantId,
    externalContextRef,
    documentId,
    accessToken,
    access.mimeType || mimeType,
  );
}
