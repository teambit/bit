import fs from 'fs';
import path from 'path';
import { parse } from 'comment-json';
import { BitError } from '@teambit/bit-error';
import type { AspectLoaderMain } from '@teambit/aspect-loader';
import { getAspectDir, getCoreAspectName, getCoreAspectPackageName } from '@teambit/aspect-loader';
import type { ApplicationMain } from '@teambit/application';
import type { DependencyResolverMain } from '@teambit/dependency-resolver';
import { detectWithCustomDetectors } from '@teambit/dependency-resolver';
import type { EnvsMain } from '@teambit/envs';
import type { Logger } from '@teambit/logger';
import type { Workspace } from '@teambit/workspace';
import type { WorkspaceInstallOptions } from './install.main.runtime';

/**
 * `InstallMain.install` called by another command (`bit import`, `bit create`, `bit merge`, ...)
 * runs on the native installer (docs/rust/native-install.md) when the addon is available. Unlike
 * `bit install` from the command line, Harmony is already loaded here, so the callbacks components
 * implement in JavaScript are served by the running aspects instead of a second Harmony instance.
 */

export type AfterInstallRequest = { compile: boolean; writeConfigFiles: boolean; clearCache: boolean };
export type AfterInstallResult = { oldNonLoadedEnvs: string[]; compiled: number };

export type NativeInstallContext = {
  workspace: Workspace;
  envs: EnvsMain;
  app: ApplicationMain;
  aspectLoader: AspectLoaderMain;
  dependencyResolver: DependencyResolverMain;
  logger: Logger;
  /** The body of one TypeScript install cycle after the package manager: env reloads, compile, config files. */
  afterInstall: (request: AfterInstallRequest) => Promise<AfterInstallResult>;
};

export type NativeInstallResult = {
  oldNonLoadedEnvs: string[];
  /**
   * External package manager mode without `showExternalPackageManagerPrompt`: the dependencies
   * were written to the root `package.json` and nothing was installed.
   */
  skipped: boolean;
  /** The native installer edited `workspace.jsonc` (added packages, `allowScripts`, leaving external mode). */
  configChanged: boolean;
};

type NativeBinding = {
  installWithOptions?: (
    options: string,
    cwd: string,
    hostInfo: string,
    host: (method: string, payload: string) => Promise<string>,
    output: (text: string) => void
  ) => Promise<string>;
};

/**
 * Install natively, or `undefined` when the TypeScript implementation must run: the addon is off or
 * missing, or the workspace uses yarn.
 */
export async function runNativeInstall(
  context: NativeInstallContext,
  packages: string[] | undefined,
  options: WorkspaceInstallOptions | undefined
): Promise<NativeInstallResult | undefined> {
  if (process.env.BIT_NATIVE_INSTALL === 'off') return required('BIT_NATIVE_INSTALL=off disables it');
  const addon = resolveNativeInstallAddon();
  if (!addon) return required('no native addon is available');
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const binding = require(addon) as NativeBinding;
  if (typeof binding.installWithOptions !== 'function') return required(`${addon} has no installWithOptions export`);
  const { prepareBuildScriptsPath } = await import('@teambit/pnpm/dist/build-scripts-path.js');
  prepareBuildScriptsPath();
  // the native installer prints status and success lines while Bit's loader exists, as the
  // TypeScript logger does. Like `PnpmPackageManager.install`, it turns the logger off for the
  // package manager and on after it, so the compile step and the caller run with the loader on.
  const { loader } = await import('@teambit/legacy.loader');
  const { logger: legacyLogger } = await import('@teambit/legacy.logger');
  const info = JSON.stringify({
    ...(await hostInfo(context)),
    loader: loader.isStarted,
    writeToConsole: legacyLogger.shouldWriteToConsole,
  });
  const host = new InProcessInstallHost({
    ...context,
    afterInstall: async (request) => {
      context.logger.on();
      try {
        return await context.afterInstall(request);
      } finally {
        // the native installer writes its own lines again until it returns.
        context.logger.off();
      }
    },
  });
  await persistPendingWorkspaceConfig(context.workspace);
  const configPath = context.workspace.getWorkspaceConfig().path;
  const configBefore = await readText(configPath);
  context.logger.off();
  let result: string;
  try {
    result = await binding.installWithOptions(
      JSON.stringify(nativeOptions(packages, options)),
      context.workspace.path,
      info,
      (method, payload) => host.serve(method, payload),
      (text) => {
        process.stdout.write(text);
      }
    );
  } catch (error: any) {
    throw new BitError(error?.message ?? String(error));
  } finally {
    context.logger.on();
  }
  const parsed = JSON.parse(result) as { outcome: string; oldNonLoadedEnvs?: string[] };
  if (parsed.outcome !== 'installed' && parsed.outcome !== 'skipped') return undefined;
  return {
    oldNonLoadedEnvs: parsed.oldNonLoadedEnvs ?? [],
    skipped: parsed.outcome === 'skipped',
    configChanged: (await readText(configPath)) !== configBefore,
  };
}

/**
 * The calling command may have changed the workspace config in memory without writing it
 * (`setExtension`). The TypeScript install reads those changes and `persistConfig` writes them
 * together with its own edits, since it writes the whole config. The native installer reads and
 * edits `workspace.jsonc` on disk, so pending changes are written before it runs, the way
 * `persistConfig` writes them. Returns whether the file was written.
 */
export async function persistPendingWorkspaceConfig(workspace: Workspace): Promise<boolean> {
  const workspaceConfig = workspace.getWorkspaceConfig();
  const text = await readText(workspaceConfig.path);
  if (text === undefined) return false;
  let onDisk: unknown;
  try {
    onDisk = parse(text);
  } catch {
    return false;
  }
  if (!hasPendingChanges(onDisk, workspaceConfig.raw)) return false;
  await workspaceConfig.write({ reasonForChange: 'install' });
  return true;
}

/** The parsed file and the in-memory config differ in content (comments and formatting aside). */
export function hasPendingChanges(onDisk: unknown, inMemory: unknown): boolean {
  return JSON.stringify(onDisk) !== JSON.stringify(inMemory);
}

async function readText(filePath: string): Promise<string | undefined> {
  return fs.promises.readFile(filePath, 'utf8').catch(() => undefined);
}

/** `WorkspaceInstallOptions` as native `InstallOptions` (`native/install/src/options.rs`). */
export function nativeOptions(packages: string[] | undefined, options: WorkspaceInstallOptions = {}) {
  return {
    packages: packages ?? [],
    lifecycleType: options.lifecycleType,
    update: options.updateAll ?? false,
    savePrefix: options.savePrefix,
    // `_installModules`: `dedupe: !hasRootComponents && options?.dedupe`.
    skipDedupe: !options.dedupe,
    // the importer's pre-install hook imports only when `import` is set.
    skipImport: !options.import,
    skipCompile: options.compile === false,
    skipWriteConfigFiles: options.writeConfigFiles === false,
    addMissingDeps: options.addMissingDeps ?? false,
    skipUnavailable: options.skipUnavailable ?? false,
    addMissingPeers: options.addMissingPeers ?? false,
    recurringInstall: options.recurringInstall ?? false,
    noOptional: options.includeOptionalDeps === false,
    lockfileOnly: options.lockfileOnly ?? false,
    restore: options.restoreFromDependenciesGraph ?? false,
    allowScripts: options.allowScripts,
    programmatic: true,
    externalPrompt: options.showExternalPackageManagerPrompt ?? false,
    // `WorkspacePolicy.add` checks `skipIfExisting` before `updateExisting`.
    existingEntries: options.skipIfExisting ? 'skip' : options.updateExisting ? 'update' : 'fail',
    skipPrune: options.skipPrune ?? false,
    appendOnly: options.optimizeReportForNonTerminal ?? false,
    copyPeerToRuntimeOnRoot: options.copyPeerToRuntimeOnRoot,
    copyPeerToRuntimeOnComponents: options.copyPeerToRuntimeOnComponents ?? false,
    // `resolveDependenciesGraph` prefers it to the graphs `restoreFromDependenciesGraph` reads.
    dependenciesGraph: options.dependenciesGraph ? JSON.parse(options.dependenciesGraph.serialize()) : undefined,
  };
}

/** `BIT_NATIVE_INSTALL_REQUIRE=on` turns a missing or disabled addon into an error. */
function required(reason: string): undefined {
  if (process.env.BIT_NATIVE_INSTALL_REQUIRE === 'on') {
    throw new BitError(`native bit install is required (BIT_NATIVE_INSTALL_REQUIRE=on) but ${reason}`);
  }
  return undefined;
}

function resolveNativeInstallAddon(): string | undefined {
  const override = process.env.BIT_NATIVE_INSTALL_ADDON;
  if (override) return path.isAbsolute(override) && fs.existsSync(override) ? override : undefined;
  try {
    // eslint-disable-next-line global-require
    const discovery = require('@teambit/objects/dist/objects/rust-object-discovery.js');
    return discovery.resolvePackagedRustWorkspaceAddon?.();
  } catch {
    return undefined;
  }
}

async function hostInfo(context: NativeInstallContext) {
  const [{ GLOBAL_CONFIG }, { getBitVersion }, { findCurrentBvmDir }, { currentDateAndTimeToFileName }] =
    await Promise.all([
      import('@teambit/legacy.constants'),
      import('@teambit/bit.get-bit-version'),
      import('@teambit/bvm.path'),
      import('@teambit/legacy.consumer/dist/bitmap-history-file-id.js'),
    ]);
  const { loadedVirtualStoreDirNames } = await import('@teambit/pnpm/dist/preserve-loaded-virtual-store-dirs.js');
  const { globalFlags } = await import('@teambit/cli');
  const chalk = (await import('chalk')).default;
  return {
    ...coreAspectsInfo(context.aspectLoader),
    bvmDir: findCurrentBvmDir() ?? null,
    nodePath: process.execPath,
    globalConfigDir: GLOBAL_CONFIG,
    bitVersion: getBitVersion(),
    columns: process.stdout.isTTY ? process.stdout.columns : null,
    color: chalk.level > 0,
    nonInteractive: process.argv.includes('--json'),
    fileId: currentDateAndTimeToFileName(),
    loadedVirtualStoreDirs: [
      ...loadedVirtualStoreDirNames(path.join(context.workspace.path, 'node_modules', '.pnpm')),
    ],
    token: globalFlags.token ?? null,
  };
}

/**
 * The link sources `DependencyLinker` uses for bit's core aspects and core packages, from the
 * running aspect loader. Rust prefers the bvm directory itself (`bvmDir`).
 */
export function coreAspectsInfo(aspectLoader: AspectLoaderMain) {
  const main = aspectLoader.mainAspect;
  const bitDir = main.path;
  const coreAspects = aspectLoader
    .getCoreAspectIds()
    .filter((id) => id !== main.id)
    .flatMap((id) => {
      const dir = aspectSource(id, bitDir);
      return dir ? [{ id, packageName: getCoreAspectPackageName(id), dir }] : [];
    });
  const corePackages = ['legacy', 'harmony'].map((name) => ({
    id: '',
    packageName: `@teambit/${name}`,
    dir: corePackageSource(name, bitDir),
  }));
  return { bitDir, coreAspects, corePackages };
}

/** `linkCoreAspect` without the bvm branch. */
function aspectSource(id: string, bitDir: string): string | undefined {
  const distDir = path.join(bitDir, 'dist', getCoreAspectName(id));
  try {
    if (!fs.existsSync(distDir)) return getAspectDir(id);
    // eslint-disable-next-line global-require, import/no-dynamic-require
    return path.resolve(path.join(require(distDir).path, '..', '..'));
  } catch {
    return undefined;
  }
}

/** `linkNonAspectCorePackages` without the bvm branch. */
function corePackageSource(name: string, bitDir: string): string {
  const packageName = `@teambit/${name}`;
  const distDir = path.join(bitDir, 'dist', name);
  if (fs.existsSync(distDir)) {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    return path.resolve(path.join(require(distDir).path, '..', '..'));
  }
  const resolved = require.resolve(packageName);
  if (resolved.includes(packageName)) return path.join(resolved, '../..');
  const nmDir = __dirname.substring(0, __dirname.indexOf('@teambit'));
  return path.join(nmDir, packageName);
}

/** Serves the native installer's JavaScript callbacks from the running Harmony instance. */
export class InProcessInstallHost {
  constructor(private context: NativeInstallContext) {}

  async serve(method: string, payload: string): Promise<string> {
    const input = JSON.parse(payload);
    switch (method) {
      case 'envPolicy':
        return JSON.stringify(await this.envPolicy(input.envId));
      case 'appTypes':
        return JSON.stringify(this.context.app.getAppPatterns());
      case 'devPatterns':
        return JSON.stringify(await this.devPatterns(input.envId));
      case 'dependencyPolicies':
        return JSON.stringify(await this.dependencyPolicies(input.extensionIds));
      case 'detectDependencies':
        return JSON.stringify(await this.detectDependencies(input.envId, input.files));
      case 'packageJsonProps':
        return JSON.stringify(await this.packageJsonProps(input.envId));
      case 'transformPackageJson':
        return JSON.stringify(await this.transformPackageJson(input.component, input.manifest));
      case 'afterInstall':
        return JSON.stringify(await this.context.afterInstall(input));
      case 'confirm':
        return JSON.stringify(await this.confirm(input.question));
      default:
        throw new Error(`unknown install host method "${method}"`);
    }
  }

  private async envPolicy(envId: string) {
    const env = await this.env(envId);
    const policy = await env?.getDependencies?.();
    return policy ?? null;
  }

  private async devPatterns(envId: string) {
    const env = await this.env(envId);
    if (!env) return null;
    const call = async (method: string) => (typeof env[method] === 'function' ? await env[method]() : null);
    return {
      devPatterns: await call('getDevPatterns'),
      tests: await call('getTestsDevPatterns'),
      docs: await call('getDocsDevPatterns'),
      compositions: await call('getCompositionsDevPatterns'),
    };
  }

  /**
   * The dependency policies aspects registered (`registerDependenciesPolicies`), as
   * `[[registrar, policy], ...]`, once the aspects the components configure are loaded.
   */
  private async dependencyPolicies(extensionIds: string[]) {
    const { workspace, dependencyResolver } = this.context;
    await workspace.loadAspects(extensionIds, false, undefined, { throwOnError: false, hideMissingModuleError: true });
    return dependencyResolver['policiesRegistry'].toArray();
  }

  /** The import specifiers custom detectors find in `files` (`detectWithCustomDetectors`). */
  private async detectDependencies(envId: string, files: string[]) {
    const env = await this.env(envId);
    return detectWithCustomDetectors(env?.getDepDetectors?.(), files);
  }

  private async packageJsonProps(envId: string) {
    const env = await this.env(envId);
    return {
      props: env?.getPackageJsonProps?.() ?? {},
      modifiesPackageJson: typeof env?.modifyPackageJson === 'function',
    };
  }

  private async transformPackageJson(componentId: string, manifest: Record<string, any>) {
    const { workspace, envs } = this.context;
    const component = await workspace.get(await workspace.resolveComponentId(componentId));
    const env = envs.getOrCalculateEnv(component).env as any;
    return env.modifyPackageJson(component, manifest);
  }

  /** A registered env, or one the workspace can load now (`loadAspects` as the CLI host does). */
  private async env(envId: string): Promise<any> {
    const { envs, workspace } = this.context;
    let definition = envs.getEnvDefinitionByStringId(envId);
    if (!definition) {
      await workspace.loadAspects([envId], false, undefined, { throwOnError: false, hideMissingModuleError: true });
      definition = envs.getEnvDefinitionByStringId(envId);
    }
    return definition?.env;
  }

  private async confirm(question: string): Promise<boolean> {
    const yesno = (await import('yesno')).default;
    return yesno({ question });
  }
}
