import { EnvService, ExecutionContext } from '@teambit/envs';

export class AppService implements EnvService<any> {
  name = 'app';

  async run(context: ExecutionContext) {
    const appContext = Object.assign(context, {
      dev: true,
    });

    return appContext;
  }
}
