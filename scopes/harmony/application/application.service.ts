import type { EnvService, Env, EnvContext, ServiceTransformationMap, ExecutionContext } from '@teambit/envs';
import type { ApplicationType } from './application-type';

type ApplicationTransformationMap = ServiceTransformationMap & {
  getAppTypes: () => ApplicationType<any>[];
};
export class AppService implements EnvService<any> {
  name = 'application';
  registerAppType: (...appType: Array<ApplicationType<any>>) => void;

  async run(context: ExecutionContext) {
    const appContext = Object.assign(context, {
      dev: true,
      errors: [],
    });

    return appContext;
  }

  transform(env: Env, context: EnvContext): ApplicationTransformationMap | undefined {
    // Old env
    if (!env?.apps) return undefined;
    const appTypesList = env.apps()(context);
    const appTypes = appTypesList.compute();
    this.registerAppType(...appTypes);
    return {
      getAppTypes: () => {
        return appTypes;
      },
    };
  }
}
