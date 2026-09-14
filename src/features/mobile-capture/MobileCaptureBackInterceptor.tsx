import { useEffect } from 'react';

import { ANDROID_BACK_EVENT } from '../../native/androidEvents';

/**
 * Keep Android Back inside the capture surface while it is open. Native ML Kit
 * scanner activities consume their own Back gesture; this covers the React
 * review/split overlays after the scanner returns.
 */
export default function MobileCaptureBackInterceptor() {
  useEffect(() => {
    const handleBack = (event: Event) => {
      const capture = document.querySelector<HTMLElement>('.mobile-doc-capture');
      if (!capture) return;

      event.preventDefault();

      const splitClose = capture.querySelector<HTMLButtonElement>(
        '.mobile-doc-capture__split-card > header button',
      );
      if (splitClose) {
        splitClose.click();
        return;
      }

      const close = capture.querySelector<HTMLButtonElement>('.mobile-doc-capture__close');
      close?.click();
    };

    window.addEventListener(ANDROID_BACK_EVENT, handleBack);
    return () => window.removeEventListener(ANDROID_BACK_EVENT, handleBack);
  }, []);

  return null;
}
