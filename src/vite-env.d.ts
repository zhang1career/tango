/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GAME_CONTENT_PATH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
