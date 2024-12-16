import * as path from 'path';
import { getRootComponentDir } from '@teambit/workspace.root-components';
import CommandHelper from './e2e-command-helper';
import ExtensionsHelper from './e2e-extensions-helper';
import FixtureHelper, { GenerateEnvJsoncOptions } from './e2e-fixtures-helper';
import FsHelper from './e2e-fs-helper';
import ScopeHelper from './e2e-scope-helper';
import ScopesData from './e2e-scopes';

type SetCustomEnvOpts = {
  skipInstall?: boolean;
  skipCompile?: boolean;
  skipLink?: boolean;
};

export const ENV_POLICY = {
  peers: [
    {
      name: 'react',
      version: '^18.0.0',
      supportedRange: '^17.0.0 || ^18.0.0',
    },
    {
      name: 'react-dom',
      version: '^18.0.0',
      supportedRange: '^17.0.0 || ^18.0.0',
    },
    {
      name: 'graphql',
      version: '14.7.0',
      supportedRange: '^14.7.0',
    },
  ],
  dev: [
    {
      name: '@types/react',
      version: '18.0.25',
      hidden: true,
      force: true,
    },
    {
      name: '@types/react-dom',
      version: '^18.0.0',
      hidden: true,
      force: true,
    },
    {
      name: '@types/jest',
      version: '29.2.2',
      hidden: true,
      force: true,
    },
  ],
  runtime: [
    {
      name: 'is-positive',
      version: '2.0.0',
    },
    {
      name: 'is-string',
      version: '1.0.7',
    },
    {
      name: 'is-odd',
      version: '3.0.1',
      force: true,
    },
  ],
};

export default class EnvHelper {
  command: CommandHelper;
  fs: FsHelper;
  fixtures: FixtureHelper;
  scopes: ScopesData;
  scopeHelper: ScopeHelper;
  compilerCreated = false;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  dummyCompilerCreated: boolean;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  dummyTesterCreated: boolean;
  extensions: ExtensionsHelper;
  constructor(
    command: CommandHelper,
    fsHelper: FsHelper,
    scopes: ScopesData,
    scopeHelper: ScopeHelper,
    fixtures: FixtureHelper,
    extensions: ExtensionsHelper
  ) {
    this.command = command;
    this.fs = fsHelper;
    this.scopes = scopes;
    this.scopeHelper = scopeHelper;
    this.fixtures = fixtures;
    this.extensions = extensions;
  }

  rootCompDirDep(envName: string, depComponentName: string) {
    return path.join(this.rootCompDir(envName), 'node_modules', `@${this.scopes.remote}/${depComponentName}`);
  }

  rootCompDir(envName: string) {
    return getRootComponentDir(path.join(this.scopes.localPath, 'node_modules/.bit_roots'), envName);
  }

  getTypeScriptSettingsForES5() {
    return {
      rawConfig: {
        tsconfig: {
          compilerOptions: {
            target: 'ES5',
            module: 'CommonJS',
          },
        },
      },
    };
  }

  /**
   * set up a new environment with two compilers, babel for the dists and ts for the d.ts files
   * returns the env name.
   */
  setBabelWithTsHarmony(): string {
    const EXTENSIONS_BASE_FOLDER = 'multiple-compilers-env';
    this.fixtures.copyFixtureExtensions(EXTENSIONS_BASE_FOLDER);
    this.command.addComponent(EXTENSIONS_BASE_FOLDER);
    this.extensions.addExtensionToVariant(EXTENSIONS_BASE_FOLDER, 'teambit.harmony/aspect');
    this.command.link();
    this.extensions.addExtensionToVariant(EXTENSIONS_BASE_FOLDER, 'teambit.dependencies/dependency-resolver', {
      policy: {
        dependencies: {
          '@babel/runtime': '^7.8.4',
          '@babel/core': '7.11.6',
          '@babel/preset-env': '7.23.2',
          '@babel/preset-typescript': '7.22.15',
          '@babel/plugin-transform-class-properties': '7.22.5',
        },
      },
    });
    this.command.install();
    this.command.compile();
    return EXTENSIONS_BASE_FOLDER;
  }

  setCustomEnv(extensionsBaseFolder = 'node-env', options: SetCustomEnvOpts = {}): string {
    this.fixtures.copyFixtureExtensions(extensionsBaseFolder);
    this.command.addComponent(extensionsBaseFolder);
    this.extensions.addExtensionToVariant(extensionsBaseFolder, 'teambit.envs/env');
    if (!options.skipLink) this.command.link();
    if (!options.skipInstall) this.command.install();
    if (!options.skipCompile) this.command.compile();
    return extensionsBaseFolder;
  }

  /**
   * This will generate env in the new format (using the *.bit-env.* plugin)
   * @param extensionsBaseFolder
   * @returns env name
   */
  setCustomNewEnv(
    extensionsBaseFolder = 'react-based-env',
    basePackages: string[] = ['@teambit/react.react-env'],
    envJsoncOptions: GenerateEnvJsoncOptions = { policy: ENV_POLICY },
    runInstall = true,
    targetFolder?: string,
    id?: string
  ): string {
    const addOptions = id ? { i: id } : {};
    this.fixtures.copyFixtureExtensions(extensionsBaseFolder, undefined, targetFolder);
    this.command.addComponent(targetFolder || extensionsBaseFolder, addOptions);
    this.fixtures.generateEnvJsoncFile(targetFolder || extensionsBaseFolder, envJsoncOptions);
    this.extensions.addExtensionToVariant(targetFolder || extensionsBaseFolder, 'teambit.envs/env');
    this.command.setEnv(id || extensionsBaseFolder, 'teambit.envs/env');
    this.command.link();
    if (runInstall) {
      this.command.install(basePackages.join(' '));
    }
    // this.command.compile();
    return extensionsBaseFolder;
  }

  getComponentEnv(id: string): string {
    const show = this.command.showComponentParsedHarmony(id);
    const env = show.find((fragment) => fragment.title === 'env');
    return env.json;
  }
}
