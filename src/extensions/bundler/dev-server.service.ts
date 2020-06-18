import { EnvService, ExecutionContext } from '../environments';
import { DevServer } from './dev-server';
import { selectPort } from './select-port';

export class DevServerService implements EnvService {
  async run(context: ExecutionContext) {
    const devServer: DevServer = context.env.getDevServer(context);
    return devServer.listen(await selectPort());
  }
}
