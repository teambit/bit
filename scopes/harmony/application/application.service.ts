import { EnvService, ExecutionContext } from '@teambit/envs';

export class AppService implements EnvService<any> {
  async run(context: ExecutionContext) {
    const appContext = Object.assign(context, {
      dev: true,
    });

    return appContext;
  }
}
