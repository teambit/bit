export const variantsSnippet = `
{
    "@teambit/variants": {
        "components/basic-ui": {
            "@teambit/react": {}
        },
        "helpers": {
        "@teambit/node": {}
        }
    }
}       
`;

export const configSnippet = `
{
    "@teambit/variants": {
      "components/basic-ui": {
         "@teambit/react": {
      “compiler”: “typescript”
  }
        }
    }
  }
`;

export const mkdirSnippet = `
mkdir -p apsects/react-env
`;

export const reactEnvTsSnippet = `
import { BuildTask } from '@teambit/builder';
import { Bundler, BundlerContext, DevServer, DevServerContext } from '@teambit/bundler';
import { Compiler, CompilerMain } from '@teambit/compiler';
import { Environment } from '@teambit/environments';
import { JestMain } from '@teambit/jest';
import { PkgMain } from '@teambit/pkg';
import { Tester, TesterMain } from '@teambit/tester';
import { TypescriptMain } from '@teambit/typescript';
import { WebpackMain } from '@teambit/webpack';
import { Workspace } from '@teambit/workspace';
import { pathNormalizeToLinux } from 'bit-bin/dist/utils';
import { join, resolve } from 'path';
import { Configuration } from 'webpack';

import { ReactMainConfig } from './react.main.runtime';
import webpackConfigFactory from './webpack/webpack.config';
import previewConfigFactory from './webpack/webpack.preview.config';

export const AspectEnvType = 'react';

export class ReactEnv implements Environment {
  constructor(
    /**
     * jest aspect
     */
    private jest: JestMain,

    /**
     * typescript aspect
     */
    private ts: TypescriptMain,

    /**
     * compiler aspect
     */
    private compiler: CompilerMain,

    /**
     * webpack aspect
     */
    private webpack: WebpackMain,

    /**
     * workspace aspect
     */
    private workspace: Workspace,

    /**
     * pkg aspect
     */
    private pkg: PkgMain,

    /**
     * tester aspect
     */
    private tester: TesterMain,

    private config: ReactMainConfig
  ) {}

  /**
   * Returns a component tester
   */
  getTester(): Tester {
    return this.jest.createTester(require.resolve('./jest/jest.config'));
  }

  /**
   * Returns a component compiler
   */
  getCompiler(targetConfig?: any): Compiler {
    const tsconfig = targetConfig || require('./typescript/tsconfig.json');
    return this.ts.createCompiler({
      tsconfig,
      types: [resolve(pathNormalizeToLinux(__dirname).replace('/dist/', '/src/'), './typescript/style.d.ts')],
    });
  }


  /**
   * Gets the default React webpack config
   */
  getWebpackConfig(context: DevServerContext): Configuration {
    const packagePaths = context.components
      .map((comp) => this.pkg.getPackageName(comp))
      .map((packageName) => join(this.workspace.path, 'node_modules', packageName));

    return webpackConfigFactory(this.workspace.path, packagePaths, context.id);
  }

  /**
   * Returns and configures the React component dev server
   */
  getDevServer(context: DevServerContext, config?: Configuration): DevServer {
    const withDocs = Object.assign(context, {
      entry: context.entry.concat([require.resolve('./docs')]),
    });

    return this.webpack.createDevServer(withDocs, config || this.getWebpackConfig(context));
  }

  async getBundler(context: BundlerContext): Promise<Bundler> {
    return this.webpack.createBundler(context, previewConfigFactory());
  }

  /**
   * Returns a path to the docs template
   */
  getDocsTemplate() {
    return require.resolve('./docs');
  }

  /**
   * Returns a function that mounts a given component composition to the DOM
   */
  getMounter() {
    return require.resolve('./mount');
  }

  /**
   * Defines the package JSON properties to add to each component
   */
  getPackageJsonProps() {
    return this.ts.getPackageJsonProps();
  }

  /**
   * Adds dependencies to all configured components.
   */
  async getDependencies() {
    return {
      dependencies: {
        react: '-',
      },

      devDependencies: {
        '@types/react': '16.9.43',
        '@types/jest': '~26.0.9',
        '@types/react-router-dom': '^5.1.5',
      },

      peerDependencies: {
        react: '^16.13.1' || this.config.reactVersion,
      },
    };
  }
`;
