/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The website's origin, for links to public job and salon pages. */
  readonly VITE_APP_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
