import { MainRuntime } from '@teambit/cli';
import { GeneratorAspect, GeneratorMain } from '@teambit/generator';
import { AngularAspect } from './angular.aspect';
import { componentTemplates } from './angular.templates';

type AngularDeps = [GeneratorMain];

export class AngularMain {
  static slots = [];
  static dependencies = [GeneratorAspect];
  static runtime = MainRuntime;
  static async provider([generator]: AngularDeps) // config: AngularMainConfig
  {
    const angularMain = new AngularMain(/* reactEnv, envs, application, workspace */);
    generator.registerComponentTemplate(componentTemplates);
    // generator.registerWorkspaceTemplate(workspaceTemplates);
    return angularMain;
  }
}

AngularAspect.addRuntime(AngularMain);
