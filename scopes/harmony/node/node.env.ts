import { pathNormalizeToLinux } from '@teambit/toolbox.path.path';
import { DependenciesEnv, PackageEnv, PipeServiceModifier, PipeServiceModifiersMap } from '@teambit/envs';
import { VariantPolicyConfigObject } from '@teambit/dependency-resolver';
import { TsConfigTransformer, TypescriptMain } from '@teambit/typescript';
import { ReactMain } from '@teambit/react';
import { Tester } from '@teambit/tester';
import { BuildTask } from '@teambit/builder';
import { COMPONENT_PREVIEW_STRATEGY_NAME, PreviewStrategyName } from '@teambit/preview';
import { SchemaExtractor } from '@teambit/schema';
import { TsConfigSourceFile } from 'typescript';
import { join } from 'path';

export const NodeEnvType = 'node';

type GetBuildPipeModifiers = PipeServiceModifiersMap & {
  tsModifier?: PipeServiceModifier;
  jestModifier?: PipeServiceModifier;
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
        '@babel/runtime': '7.20.0',
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
    const pathToSource = pathNormalizeToLinux(__dirname).replace('/dist', '');
    const jestConfigPath = modifiers?.jestModifier?.transformers?.[0]() || join(pathToSource, './jest/jest.config.js');
    modifiers.jestModifier = modifiers.jestModifier || {};
    modifiers.jestModifier.transformers = [() => jestConfigPath];
    return this.reactAspect.reactEnv.getBuildPipe(modifiers);
  }

  /**
   * returns a component tester.
   */
  getTester(jestConfigPath: string, jestModulePath?: string): Tester {
    const config = jestConfigPath || require.resolve('./jest/jest.config');
    return this.reactAspect.reactEnv.createCjsJestTester(config, jestModulePath);
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

  getSchemaExtractor(tsconfig: TsConfigSourceFile, tsserverPath?: string, contextPath?: string): SchemaExtractor {
    return this.tsAspect.createSchemaExtractor(
      this.reactAspect.reactEnv.getTsConfig(tsconfig),
      tsserverPath,
      contextPath
    );
  }

  async __getDescriptor() {
    return {
      type: NodeEnvType,
    };
  }
}
