import { EnvService, Env, EnvContext, ServiceTransformationMap, ExecutionContext } from '@teambit/envs';
import { ApplicationType } from './application-type';

type ApplicationTransformationMap = ServiceTransformationMap  & {
  getAppTypes: () => ApplicationType<any>[];
}
export class AppService implements EnvService<any> {
  name = 'application';
  registerAppType: (appType: ApplicationType<any>) => void;

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
    console.log('appTypes', appTypes)
    appTypes.forEach(appType => {
      this.registerAppType(appType);
    });
    return {
      getAppTypes: () => {
        return appTypes;
      },
    }
  }
}
