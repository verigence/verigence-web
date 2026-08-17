/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AUDIT_CORE_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
