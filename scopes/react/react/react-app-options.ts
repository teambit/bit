import { Bundler, DevServer } from '@teambit/bundler';

export type ReactAppOptions = {
  name: string;

  ssr?: boolean;

  bundler?: Bundler;

  devServer?: DevServer;

  deploy?: () => void;

  portRange: number[];
};
