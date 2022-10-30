import { DependenciesEnv, PackageEnv, PipeServiceModifier, PipeServiceModifiersMap } from '@teambit/envs';
import { VariantPolicyConfigObject } from '@teambit/dependency-resolver';
import { TsConfigTransformer, TypescriptMain } from '@teambit/typescript';
import { ReactMain } from '@teambit/react';
import { Tester } from '@teambit/tester';
import { BuildTask } from '@teambit/builder';
import { COMPONENT_PREVIEW_STRATEGY_NAME, PreviewStrategyName } from '@teambit/preview';

export const NodeEnvType = 'node';

type GetBuildPipeModifiers = PipeServiceModifiersMap & {
  tsModifier?: PipeServiceModifier;
};
export class NodeEnv implements DependenciesEnv, PackageEnv {
  constructor(protected tsAspect: TypescriptMain, protected reactAspect: ReactMain) {}

  icon = 'https://static.bit.dev/extensions-icons/nodejs.svg';

  getDependencies(): VariantPolicyConfigObject {
    return {
      devDependencies: {
        '@types/jest': '26.0.20',
        '@types/node': '12.20.4',
        // This is added as dev dep since our jest file transformer uses babel plugins that require this to be installed
        '@babel/runtime': '7.12.18',
      },
    };
  }

  getCompiler(transformers: TsConfigTransformer[] = [], tsModule) {
    return this.reactAspect.reactEnv.getTsCjsCompiler('dev', transformers, tsModule);
  }

  /**
   * returns the component build pipeline.
   */
  getBuildPipe(modifiers: GetBuildPipeModifiers = {}): BuildTask[] {
    const tsTransformers: TsConfigTransformer[] =
      (modifiers?.tsModifier?.transformers as any as TsConfigTransformer[]) || [];
    const compilerTask = this.reactAspect.reactEnv.getCjsCompilerTask(tsTransformers, modifiers?.tsModifier?.module);

    const pipeWithoutCompiler = this.reactAspect.reactEnv.getBuildPipeWithoutCompiler();
    return [compilerTask, ...pipeWithoutCompiler];
  }

  /**
   * returns a component tester.
   */
  getTester(jestConfigPath: string, jestModulePath?: string): Tester {
    const config = jestConfigPath || require.resolve('./jest/jest.config');
    return this.reactAspect.reactEnv.getCjsJestTester(config, jestModulePath);
  }

  getPreviewConfig() {
    return {
      strategyName: COMPONENT_PREVIEW_STRATEGY_NAME as PreviewStrategyName,
      splitComponentBundle: false,
    };
  }

  getPackageJsonProps() {
    return this.tsAspect.getCjsPackageJsonProps();
  }

  async __getDescriptor() {
    return {
      type: NodeEnvType,
    };
  }
}
