/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_MODE?: string;
  readonly VITE_MEDIA_BASE_URL?: string;
  readonly VITE_CHARACTERS_PATH?: string;
  readonly VITE_RULES_PATH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
