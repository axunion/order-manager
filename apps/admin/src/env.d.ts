/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE: string;
  readonly VITE_ORDER_BASE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
