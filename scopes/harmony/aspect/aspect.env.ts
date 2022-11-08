import { Compiler } from '@teambit/compiler';
import type { DependenciesEnv, PackageEnv, GetNpmIgnoreContext, PreviewEnv } from '@teambit/envs';
import { merge } from 'lodash';
import { PackageJsonProps } from '@teambit/pkg';
import { TsConfigSourceFile } from 'typescript';
import { ReactEnv } from '@teambit/react';
import { CAPSULE_ARTIFACTS_DIR } from '@teambit/builder';
import type { AspectLoaderMain } from '@teambit/aspect-loader';
import { Bundler, BundlerContext } from '@teambit/bundler';
import { WebpackConfigTransformer } from '@teambit/webpack';
import { Tester } from '@teambit/tester';
import { COMPONENT_PREVIEW_STRATEGY_NAME, PreviewStrategyName } from '@teambit/preview';

const tsconfig = require('./typescript/tsconfig.json');

export const AspectEnvType = 'aspect';

/**
 * a component environment built for Aspects .
 */
export class AspectEnv implements DependenciesEnv, PackageEnv, PreviewEnv {
  constructor(private reactEnv: ReactEnv, private aspectLoader: AspectLoaderMain) {}

  icon = 'https://static.bit.dev/extensions-icons/default.svg';

  async __getDescriptor() {
    return {
      type: AspectEnvType,
    };
  }

  getTsConfig(tsConfig: TsConfigSourceFile) {
    const targetConf = merge(tsconfig, tsConfig);
    return targetConf;
  }

  // TODO: should probably use the transformer from the main runtime?
  // TODO: this doesn't seems to work as expected, the getTsConfig is not a transformer and the react env API expect a transformers array not an object
  createTsCompiler(tsConfig: TsConfigSourceFile): Compiler {
    return this.reactEnv.getTsCjsCompiler(this.getTsConfig(tsConfig));
  }

  /**
   * returns a component tester.
   */
  getTester(jestConfigPath: string, jestModulePath?: string): Tester {
    const config = jestConfigPath || require.resolve('@teambit/node/jest/jest.config');
    return this.reactEnv.getCjsJestTester(config, jestModulePath);
  }

  async getTemplateBundler(context: BundlerContext, transformers: WebpackConfigTransformer[] = []): Promise<Bundler> {
    return this.createTemplateWebpackBundler(context, transformers);
  }

  async createTemplateWebpackBundler(
    context: BundlerContext,
    transformers: WebpackConfigTransformer[] = []
  ): Promise<Bundler> {
    return this.reactEnv.createTemplateWebpackBundler(context, transformers);
  }

  getPackageJsonProps(): PackageJsonProps {
    return this.reactEnv.getCjsPackageJsonProps();
  }

  getNpmIgnore(context?: GetNpmIgnoreContext) {
    // ignores only .ts files in the root directory, so d.ts files inside dists are unaffected.
    // without this change, the package has "index.ts" file in the root, causing typescript to parse it instead of the
    // d.ts files. (changing the "types" prop in the package.json file doesn't help).
    const patterns = ['/*.ts', `${CAPSULE_ARTIFACTS_DIR}/`];

    // In order to load the env preview template from core aspects we need it to be in the package of the core envs
    // This is because we don't have the core envs in the local scope so we load it from the package itself in the bvm installation
    // as this will be excluded from the package tar by default (as it's under the CAPSULE_ARTIFACTS_DIR)
    // we want to make sure to add it for the core envs
    if (context && this.aspectLoader.isCoreEnv(context.component.id.toStringWithoutVersion())) {
      patterns.push(`!${CAPSULE_ARTIFACTS_DIR}/env-template`);
    }
    return patterns;
  }

  getPreviewConfig() {
    return {
      strategyName: COMPONENT_PREVIEW_STRATEGY_NAME as PreviewStrategyName,
      splitComponentBundle: false,
    };
  }

  async getDependencies() {
    return {
      dependencies: {
        react: '-',
        'react-dom': '-',
        'core-js': '^3.0.0',
        // For aspects the babel runtime should be a runtime dep not only dev as they are compiled by babel
        '@babel/runtime': '7.20.0',
      },
      // TODO: add this only if using ts
      devDependencies: {
        react: '-',
        'react-dom': '-',
        '@types/mocha': '-',
        '@types/node': '12.20.4',
        '@types/react': '^17.0.8',
        '@types/react-dom': '^17.0.5',
        '@types/jest': '^26.0.0',
        '@types/testing-library__jest-dom': '5.9.5',
      },
      peerDependencies: {
        // TODO: check if we really need react for aspects (maybe for ink support)
        react: '^16.8.0 || ^17.0.0',
        'react-dom': '^16.8.0 || ^17.0.0',
      },
    };
  }
}
