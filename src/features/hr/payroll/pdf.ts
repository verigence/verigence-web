/**
 * Payslip PDFs are fetched with the person's token, so they cannot be a plain link. They are fetched as a
 * blob and shown through an object URL, which is released afterwards.
 */

const RELEASE_AFTER_MS = 120_000;

function releaseLater(url: string, after = RELEASE_AFTER_MS): void {
  window.setTimeout(() => URL.revokeObjectURL(url), after);
}

/**
 * Opens the PDF in a new tab. The tab is opened straight away (while the tap still counts as a click) and
 * pointed at the PDF once it arrives. If the browser refuses the tab, the object URL is returned so the
 * caller can show an "Open" link; the caller must pass it to `releasePdfUrl` when done.
 */
export async function viewPdf(load: () => Promise<Blob>): Promise<string | null> {
  const tab = window.open('', '_blank');
  if (tab) tab.opener = null;
  try {
    const blob = await load();
    const url = URL.createObjectURL(blob);
    if (tab && !tab.closed) {
      tab.location.href = url;
      releaseLater(url);
      return null;
    }
    return url;
  } catch (error) {
    tab?.close();
    throw error;
  }
}

export function releasePdfUrl(url: string | null): void {
  if (url) URL.revokeObjectURL(url);
}

/** Saves the PDF as a file. */
export async function downloadPdf(load: () => Promise<Blob>, filename: string): Promise<void> {
  const blob = await load();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  releaseLater(url, 10_000);
}

export const payslipFileName = (month: string, suffix = '') => `payslip-${month}${suffix}.pdf`;
