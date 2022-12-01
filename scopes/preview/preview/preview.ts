import { Bundler, BundlerContext, DevServer, DevServerContext } from "@teambit/bundler";

export interface Preview {
  /**
   * get a dev server instance of the.
   */
  getDevServer(context: DevServerContext): DevServer;

  /**
   * get bundler instance.
   */
  getBundler(context: BundlerContext): Bundler;
}
