import * as path from 'path';
import fs from 'fs-extra';
import { getRootComponentDir } from '@teambit/workspace.root-components';
import type CommandHelper from './e2e-command-helper';
import type ExtensionsHelper from './e2e-extensions-helper';
import type { GenerateEnvJsoncOptions } from './e2e-fixtures-helper';
import type FixtureHelper from './e2e-fixtures-helper';
import type FsHelper from './e2e-fs-helper';
import type ScopeHelper from './e2e-scope-helper';
import type ScopesData from './e2e-scopes';

type SetCustomEnvOpts = {
  skipInstall?: boolean;
  skipCompile?: boolean;
  skipLink?: boolean;
};

/**
 * env packages that the old-format env fixtures import. these envs used to be core aspects, so
 * their packages were always available. now they need to be installed. the versions should match
 * the pinned versions in legacy-core-envs.ts (scopes/envs/envs).
 */
const FIXTURE_ENV_BASE_PACKAGES: Record<string, string> = {
  '@teambit/node': '@teambit/node@1.0.1042',
  '@teambit/react': '@teambit/react@1.0.1042',
  '@teambit/mdx': '@teambit/mdx@1.0.1043',
};

/**
 * the env configured on the old-format env fixtures (see setCustomEnv). it used to be a core
 * aspect, now its package must be installed for the fixture env to be compiled and loaded.
 */
const ENVS_ENV_PACKAGE = '@teambit/env@1.0.1042';

/**
 * the env configured on old-format aspect-style env fixtures (see setBabelWithTsHarmony). it used
 * to be a core aspect, now its package must be installed for the fixture env to be loaded.
 * the node env is a runtime dependency of the aspect env and must be installed at the root as
 * well for the aspect env to load.
 */
const ASPECT_ENV_PACKAGES = ['@teambit/aspect@1.0.1042', '@teambit/node@1.0.1042'];

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
    this.command.install([...ASPECT_ENV_PACKAGES, ...this.getFixtureEnvBasePackages(EXTENSIONS_BASE_FOLDER)].join(' '));
    this.command.compile();
    return EXTENSIONS_BASE_FOLDER;
  }

  setEmptyEnv() {
    this.fs.outputFile(
      'empty-env/empty-env.bit-env.ts',
      `export class EmptyEnv {}
export default new EmptyEnv();
`
    );
    this.fs.outputFile('empty-env/index.ts', `export { EmptyEnv } from './empty-env.bit-env';`);
    this.command.addComponent('empty-env');
    this.command.setEnv('empty-env', 'teambit.envs/env');
  }

  /**
   * set the legacy `teambit.harmony/node` env on the given variant and install its package.
   * this env used to be a core aspect so no installation was needed, now it must be installed
   * (with the version pinned in legacy-core-envs.ts, see FIXTURE_ENV_BASE_PACKAGES).
   */
  setNodeEnv(variantPattern = '*') {
    this.extensions.addExtensionToVariant(variantPattern, 'teambit.harmony/node', {});
    this.command.install(FIXTURE_ENV_BASE_PACKAGES['@teambit/node']);
  }

  setCustomEnv(extensionsBaseFolder = 'node-env', options: SetCustomEnvOpts = {}): string {
    this.fixtures.copyFixtureExtensions(extensionsBaseFolder);
    this.command.addComponent(extensionsBaseFolder);
    this.extensions.addExtensionToVariant(extensionsBaseFolder, 'teambit.envs/env');
    if (!options.skipLink) this.command.link();
    if (!options.skipInstall) {
      this.command.install([ENVS_ENV_PACKAGE, ...this.getFixtureEnvBasePackages(extensionsBaseFolder)].join(' '));
    }
    if (!options.skipCompile) this.command.compile();
    return extensionsBaseFolder;
  }

  /**
   * find which env packages the given fixture imports, so they can be installed (see
   * FIXTURE_ENV_BASE_PACKAGES).
   */
  getFixtureEnvBasePackages(extensionsBaseFolder: string): string[] {
    const extensionDir = path.join(this.scopes.localPath, extensionsBaseFolder);
    const allContent = fs
      .readdirSync(extensionDir)
      .filter((file) => file.endsWith('.ts'))
      .map((file) => fs.readFileSync(path.join(extensionDir, file)).toString())
      .join('\n');
    return Object.keys(FIXTURE_ENV_BASE_PACKAGES)
      .filter((pkg) => allContent.includes(`'${pkg}'`) || allContent.includes(`"${pkg}"`))
      .map((pkg) => FIXTURE_ENV_BASE_PACKAGES[pkg]);
  }

  /**
   * This will generate env in the new format (using the *.bit-env.* plugin)
   * @param extensionsBaseFolder
   * @returns env name
   */
  setCustomNewEnv(
    extensionsBaseFolder = 'react-based-env',
    basePackages: string[] = ['@teambit/react.react-env@1.3.5'],
    envJsoncOptions: GenerateEnvJsoncOptions = { policy: ENV_POLICY },
    runInstall = true,
    targetFolder?: string,
    id?: string
  ): string {
    const addOptions = id ? { i: id } : {};
    // Pin the base react-env to a React 18 version, but only for envs that actually pull in react-env.
    // Otherwise it floats onto the latest published react-env (2.0.0+, which is on React 19), and
    // react-dom 19 enforces an exact react/react-dom version match that breaks these tests when they
    // override react to 16/17/18. Skipping the pin for non-React fixtures (e.g. a mocha-only env)
    // avoids installing react-env where it isn't used.
    const usesReactEnv = basePackages.some(
      (pkg) => pkg === '@teambit/react.react-env' || pkg.startsWith('@teambit/react.react-env@')
    );
    if (usesReactEnv) {
      // Merge into any existing dependency pins rather than replacing them, since
      // addPolicyToDependencyResolver shallow-assigns and would otherwise drop prior pins.
      // Guard against a non-object `dependencies` (a few tests set it to a string, e.g. 'chai@4.1.2'),
      // which would otherwise spread into a char-indexed object and corrupt the policy.
      const existingDeps = this.extensions.workspaceJsonc.getPolicyFromDependencyResolver()?.dependencies;
      const existingPolicyDeps =
        existingDeps && typeof existingDeps === 'object' && !Array.isArray(existingDeps) ? existingDeps : {};
      this.extensions.workspaceJsonc.addPolicyToDependencyResolver({
        dependencies: { ...existingPolicyDeps, '@teambit/react.react-env': '1.3.5' },
      });
    }
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
