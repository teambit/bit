// import { AddressInfo } from 'net';
import { join } from 'path';
import { AddressInfo } from 'net';
import { EnvService, ExecutionContext } from '../environments';
import { DevServer } from './dev-server';
import { selectPort } from './select-port';
import { ComponentServer } from './component-server';
import { BindError } from './exceptions';
import { BrowserRuntimeSlot } from './bundler.extension';
import { DevServerContext } from './dev-server-context';
import { Workspace } from '../workspace';

export class DevServerService implements EnvService {
  constructor(
    /**
     * browser runtime slot
     */
    private runtimeSlot: BrowserRuntimeSlot,

    /**
     * workspace extension.
     */
    private workspace: Workspace
  ) {}

  async run(context: ExecutionContext) {
    const devServer: DevServer = context.env.getDevServer(await this.buildContext(context));
    const port = await selectPort();
    const server = devServer.listen(port);
    const address = server.address();
    const hostname = this.getHostname(address);
    if (!address) throw new BindError();

    return new ComponentServer(context.components, port, hostname, context.envRuntime);
  }

  /**
   * builds the execution context for the dev server.
   */
  private async buildContext(context: ExecutionContext): Promise<DevServerContext> {
    return Object.assign(context, {
      entry: await this.getEntry(context),
    });
  }

  /**
   * computes the bundler entry.
   */
  private async getEntry(context: ExecutionContext): Promise<string[]> {
    const mainFiles = context.components.map((component) => {
      const path = join(
        // :TODO check how it works with david. Feels like a side-effect.
        // @ts-ignore
        // component.state._consumer.componentMap?.getComponentDir()
        this.workspace.componentDir(component.id, {}, { relative: true }),
        // @ts-ignore
        component.config.main
      );

      return path;
    });

    const slotEntries = await Promise.all(
      this.runtimeSlot.values().map(async (browserRuntime) => browserRuntime.entry(context))
    );

    const slotPaths = slotEntries.reduce((acc, current) => {
      acc = acc.concat(current);
      return acc;
    });

    const paths = mainFiles.concat(slotPaths);

    return paths;
  }

  private getHostname(address: string | AddressInfo | null) {
    if (address === null) throw new BindError();
    if (typeof address === 'string') return address;

    let hostname = address.address;
    if (hostname === '::') {
      hostname = 'localhost';
    }

    return hostname;
  }
}
