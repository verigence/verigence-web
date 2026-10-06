/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AUDIT_CORE_BASE_URL?: string;
  readonly VITE_SECURITY_BASE_URL?: string;
  readonly VITE_HR_PROXY_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** The version in package.json, put in at build time (see vite.config.ts). */
declare const __APP_VERSION__: string;
