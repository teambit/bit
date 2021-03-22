import { Application } from '@teambit/application';
import { DevServer } from '@teambit/bundler';
import getPort from 'get-port';

export class ReactApp implements Application {
  constructor(readonly name: string, readonly portRange: number[], private devServer: DevServer) {}

  async serve(): Promise<void> {
    return {};
  }

  async dev() {
    const port = await getPort({ port: this.portRange });
    this.devServer.listen(port);
  }
}
