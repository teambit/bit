import { Application, AppContext } from '@teambit/application';
import { DevServerContext } from '@teambit/bundler';
import getPort from 'get-port';
import { ReactEnv } from './react.env';

export class ReactApp implements Application {
  constructor(
    readonly name: string,
    readonly entry: string[],
    readonly portRange: number[],
    private reactEnv: ReactEnv,
    private rootPath: string
  ) {}

  async run(context: AppContext): Promise<void> {
    const devServerContext = this.getDevServerContext(context);
    const devServer = this.reactEnv.getDevServer(devServerContext);
    const port = await getPort({ port: this.portRange });
    devServer.listen(port);
  }

  private getDevServerContext(context: AppContext): DevServerContext {
    return Object.assign(context, {
      entry: this.entry,
      rootPath: '',
      publicPath: `public/${this.name}`,
    });
  }
}
