import { EnvService, ExecutionContext } from '@teambit/environments';
import { UIRoot } from '@teambit/ui';
import { PubsubMain } from '@teambit/pubsub';

import { BrowserRuntimeSlot } from './bundler.main.runtime';
import { ComponentServer } from './component-server';
import { DevServer } from './dev-server';
import { DevServerContext } from './dev-server-context';
import { getEntry } from './get-entry';
import { selectPort } from './select-port';

export class DevServerService implements EnvService<ComponentServer> {
  constructor(
    /**
     * browser runtime slot
     */
    private pubsub: PubsubMain,

    /**
     * browser runtime slot
     */
    private runtimeSlot: BrowserRuntimeSlot,

    /**
     * main path of the dev server to execute on.
     */
    private _uiRoot?: UIRoot
  ) {}

  set uiRoot(value: UIRoot) {
    this._uiRoot = value;
  }

  async run(context: ExecutionContext): Promise<ComponentServer> {
    const devServerContext = await this.buildContext(context);
    const devServer: DevServer = context.env.getDevServer(devServerContext);
    const port = await selectPort();
    // TODO: refactor to replace with a component server instance.
    return new ComponentServer(this.pubsub, context, port, devServer);
  }

  /**
   * builds the execution context for the dev server.
   */
  private async buildContext(context: ExecutionContext): Promise<DevServerContext> {
    const uiRoot = this._uiRoot;
    if (!uiRoot) throw new Error('a root must be provided by UI root');

    return Object.assign(context, {
      entry: await getEntry(context, uiRoot, this.runtimeSlot),
      rootPath: `/preview/${context.envRuntime.id}`,
      publicPath: `/public`,
    });
  }
}
