/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AUDIT_CORE_BASE_URL?: string;
  readonly VITE_SECURITY_BASE_URL?: string;
  readonly VITE_GOOGLE_MAPS_EMBED_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
