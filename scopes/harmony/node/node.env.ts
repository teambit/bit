import { pathNormalizeToLinux } from '@teambit/toolbox.path.path';
import type { DependenciesEnv, PackageEnv, PipeServiceModifier, PipeServiceModifiersMap } from '@teambit/envs';
import type { EnvPolicyConfigObject } from '@teambit/dependency-resolver';
import type { TsConfigTransformer, TypescriptMain } from '@teambit/typescript';
import type { ReactMain } from '@teambit/react';
import type { Tester } from '@teambit/tester';
import type { BuildTask } from '@teambit/builder';
import type { SchemaExtractor } from '@teambit/schema';
import type { TsConfigSourceFile } from 'typescript';
import { join } from 'path';
import { getNodeDependencyPolicy } from './default-dependency-policy';
import { NODE_ENV_ICON, getNodeEnvDescriptor, getNodePreviewConfig } from './default-load-data';

export { NodeEnvType } from './default-load-data';

type GetBuildPipeModifiers = PipeServiceModifiersMap & {
  tsModifier?: PipeServiceModifier;
  jestModifier?: PipeServiceModifier;
};
export class NodeEnv implements DependenciesEnv, PackageEnv {
  constructor(
    protected tsAspect: TypescriptMain,
    protected reactAspect: ReactMain
  ) {}

  icon = NODE_ENV_ICON;

  getDependencies(): EnvPolicyConfigObject {
    return getNodeDependencyPolicy();
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
    return getNodePreviewConfig();
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
    return getNodeEnvDescriptor();
  }
}
