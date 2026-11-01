/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional: full URL of a separately hosted API, e.g. https://api.example.com (default: same origin). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
