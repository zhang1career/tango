/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_MODE?: string;
  readonly VITE_GAMES_BASE_PATH?: string;
  readonly GAMES_BASE_PATH?: string;
  readonly VITE_MEDIA_BASE_URL?: string;
  readonly VITE_CHARACTERS_PATH?: string;
  readonly VITE_RULES_PATH?: string;
  readonly VITE_ADMIN_PASS?: string;
  readonly VITE_AUTH_EXPIRE_MINUTES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
