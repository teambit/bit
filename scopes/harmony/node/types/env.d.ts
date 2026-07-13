export type ImportMetaEnv = Record<string, string>;

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      [key: string]: string;
    }
  }
}
