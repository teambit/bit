import { MainRuntime } from '@teambit/cli';
import { GeneratorAspect, GeneratorMain } from '@teambit/generator';
import { ESLintAspect, ESLintMain } from '@teambit/eslint';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import { AngularAspect } from './angular.aspect';
import { AngularEnv } from './angular.env';
import { componentTemplates } from './angular.templates';

type AngularDeps = [EnvsMain, ESLintMain, GeneratorMain];

export class AngularMain {
  static slots = [];
  static dependencies = [EnvsAspect, ESLintAspect, GeneratorAspect];
  static runtime = MainRuntime;
  static async provider([envs, eslint, generator]: AngularDeps) {
    const angularEnv = new AngularEnv(eslint);
    const angularMain = new AngularMain(/* reactEnv, envs, application, workspace */);
    envs.registerEnv(angularEnv);
    generator.registerComponentTemplate(componentTemplates);
    // generator.registerWorkspaceTemplate(workspaceTemplates);
    return angularMain;
  }
}

AngularAspect.addRuntime(AngularMain);
