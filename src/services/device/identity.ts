import { Capacitor } from '@capacitor/core';

export type VerigenceDeviceType = 'MOBILE' | 'WEB';
export type VerigencePlatform = 'ANDROID' | 'IOS' | 'WINDOWS' | 'MACOS' | 'LINUX' | 'OTHER';

export interface VerigenceDeviceContext {
  deviceId: string;
  deviceType: VerigenceDeviceType;
  platform: VerigencePlatform;
  deviceName?: string;
  deviceModel?: string;
  osVersion?: string;
  browserName?: string;
  browserVersion?: string;
  appVersion?: string;
}

const DEVICE_ID_STORAGE_KEY = 'verigence.device.installation-id.v1';
let cachedDeviceContext: VerigenceDeviceContext | undefined;

function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function installationId(): string {
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY)?.trim();
    if (existing) return existing;
    const created = uuid();
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, created);
    return created;
  } catch {
    // Privacy modes can disable persistent storage. Keep the identifier stable for this running
    // application instance; a future launch is correctly observed as a new browser installation.
    return uuid();
  }
}

function browser(): { name?: string; version?: string } {
  const ua = navigator.userAgent;
  const patterns: Array<[string, RegExp]> = [
    ['Edge', /Edg\/([\d.]+)/],
    ['Chrome', /Chrome\/([\d.]+)/],
    ['Firefox', /Firefox\/([\d.]+)/],
    ['Safari', /Version\/([\d.]+).*Safari/],
  ];
  for (const [name, pattern] of patterns) {
    const match = ua.match(pattern);
    if (match) return { name, version: match[1] };
  }
  return {};
}

function webPlatform(): VerigencePlatform {
  const value = `${navigator.platform ?? ''} ${navigator.userAgent}`.toLowerCase();
  if (value.includes('windows')) return 'WINDOWS';
  if (value.includes('mac')) return 'MACOS';
  if (value.includes('linux')) return 'LINUX';
  if (value.includes('iphone') || value.includes('ipad') || value.includes('ios')) return 'IOS';
  if (value.includes('android')) return 'ANDROID';
  return 'OTHER';
}

function nativePlatform(): VerigencePlatform {
  switch (Capacitor.getPlatform()) {
    case 'android': return 'ANDROID';
    case 'ios': return 'IOS';
    default: return 'OTHER';
  }
}

export function getVerigenceDeviceContext(): VerigenceDeviceContext {
  if (cachedDeviceContext) return cachedDeviceContext;

  const isNative = Capacitor.isNativePlatform();
  const detectedBrowser = browser();
  cachedDeviceContext = {
    deviceId: installationId(),
    deviceType: isNative ? 'MOBILE' : 'WEB',
    platform: isNative ? nativePlatform() : webPlatform(),
    deviceName: isNative ? 'Verigence Mobile' : detectedBrowser.name,
    browserName: isNative ? 'Capacitor WebView' : detectedBrowser.name,
    browserVersion: detectedBrowser.version,
  };
  return cachedDeviceContext;
}
