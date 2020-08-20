import { EnvService, ExecutionContext } from '@teambit/environments';
import { DevServer } from './dev-server';
import { selectPort } from './select-port';
import { ComponentServer } from './component-server';
import { BrowserRuntimeSlot } from './bundler.main.runtime';
import { DevServerContext } from './dev-server-context';
import { UIRoot } from '@teambit/ui';
import { getEntry } from './get-entry';

export class DevServerService implements EnvService {
  constructor(
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

  async run(context: ExecutionContext) {
    const devServerContext = await this.buildContext(context);
    const devServer: DevServer = context.env.getDevServer(devServerContext);
    const port = await selectPort();
    // TODO: refactor to replace with a component server instance.
    return new ComponentServer(context, port, devServer);
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
