import { AppBuildResult } from '@teambit/application';

export type ReactAppBuildResult = {
  /**
   * the directory which includes the built application public assets.
   * when using ssr, public dir is undefined.
   */
  publicDir?: string;
  ssrPublicDir?: string;
} & AppBuildResult;
