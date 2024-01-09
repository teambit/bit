import { EnvService, Env, EnvContext, ServiceTransformationMap } from '@teambit/envs';
import { ComponentTemplate } from './component-template';
import { WorkspaceTemplate } from './workspace-template';

type GeneratorTransformationMap = ServiceTransformationMap & {
  getGeneratorTemplates: () => ComponentTemplate;
  getGeneratorStarters: () => WorkspaceTemplate;
};
export class GeneratorService implements EnvService<any> {
  name = 'generator';

  transform(env: Env, context: EnvContext): GeneratorTransformationMap | undefined {
    // Old env
    if (!env?.generators) return undefined;
    return {
      getGeneratorTemplates: () => {
        if (!env.generators) return undefined;
        const generatorList = env.generators()(context);
        return generatorList.compute();
      },
      getGeneratorStarters: () => {
        if (!env.starters) return undefined;
        const starterList = env.starters()(context);
        return starterList.compute();
      },
    };
  }
}
