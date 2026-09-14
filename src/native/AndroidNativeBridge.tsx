import { useEffect } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { Keyboard, KeyboardResize } from '@capacitor/keyboard';
import { StatusBar, Style } from '@capacitor/status-bar';
import { useLocation, useNavigate } from 'react-router-dom';

import MobileCaptureBackInterceptor from '../features/mobile-capture/MobileCaptureBackInterceptor';
import MobileDocumentCaptureHost from '../features/mobile-capture/MobileDocumentCaptureHost';
import { ANDROID_BACK_EVENT } from './androidEvents';

export default function AndroidNativeBridge() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return undefined;

    document.documentElement.classList.add('native-android');

    void StatusBar.setOverlaysWebView({ overlay: false }).catch(() => undefined);
    void StatusBar.setBackgroundColor({ color: '#ffffff' }).catch(() => undefined);
    void StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined);
    void Keyboard.setResizeMode({ mode: KeyboardResize.Native }).catch(() => undefined);

    let backHandle: PluginListenerHandle | undefined;
    void CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      const intercepted = new Event(ANDROID_BACK_EVENT, { cancelable: true });
      window.dispatchEvent(intercepted);
      if (intercepted.defaultPrevented) return;

      if (location.pathname === '/login' || location.pathname === '/dashboard') {
        void CapacitorApp.exitApp();
        return;
      }

      if (canGoBack) {
        navigate(-1);
      } else {
        navigate('/dashboard', { replace: true });
      }
    }).then((handle) => {
      backHandle = handle;
    }).catch(() => undefined);

    return () => {
      document.documentElement.classList.remove('native-android');
      void backHandle?.remove();
    };
  }, [location.pathname, navigate]);

  return (
    <>
      <MobileCaptureBackInterceptor />
      <MobileDocumentCaptureHost />
    </>
  );
}

export { ANDROID_BACK_EVENT } from './androidEvents';
