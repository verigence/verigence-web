import { useEffect } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { Keyboard, KeyboardResize } from '@capacitor/keyboard';
import { StatusBar, Style } from '@capacitor/status-bar';
import { useLocation, useNavigate } from 'react-router-dom';

const ANDROID_BACK_EVENT = 'verigence:android-back';

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

    // Track whether this effect has already been cleaned up. If cleanup fires
    // before the addListener promise resolves (fast unmount), we immediately
    // remove the handle so the listener is never left dangling.
    let aborted = false;
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
      if (aborted) {
        // Cleanup already ran — remove the listener immediately
        void handle.remove();
      } else {
        backHandle = handle;
      }
    }).catch(() => undefined);

    return () => {
      aborted = true;
      document.documentElement.classList.remove('native-android');
      void backHandle?.remove();
    };
  }, [location.pathname, navigate]);

  return null;
}

export { ANDROID_BACK_EVENT };
