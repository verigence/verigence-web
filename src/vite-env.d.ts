/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AUDIT_CORE_BASE_URL?: string;
  readonly VITE_WEB_MODE?: 'demo' | 'core';
  readonly VITE_TENANT_ID?: string;
  readonly VITE_DEFAULT_DEALER_ID?: string;
  readonly VITE_DEFAULT_OUTLET_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
