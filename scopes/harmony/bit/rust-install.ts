import fs from 'fs';
import path from 'path';
import type { Harmony } from '@teambit/harmony';
import { BitError } from '@teambit/bit-error';

/**
 * Native `bit install` (docs/rust/native-install.md). The whole command runs in Rust; this module
 * only loads the addon, describes the running bit process, and serves the callbacks components
 * implement in JavaScript.
 */
export async function runRustInstall(): Promise<boolean> {
  if (process.env.BIT_NATIVE_INSTALL === 'off') return false;
  const addon = resolveNativeInstallAddon();
  if (!addon) return false;
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const binding = require(addon) as { install?: NativeInstall };
  if (typeof binding.install !== 'function') return false;
  const { logger } = await import('@teambit/legacy.logger');
  const root = findWorkspaceRoot(process.cwd());
  if (root) {
    logger.commandHistoryBasePath = path.join(root, '.bit');
    logger.writeCommandHistoryStart();
  }
  const host = new InstallHost(root ?? process.cwd());
  const { prepareBuildScriptsPath } = await import('@teambit/pnpm/dist/build-scripts-path.js');
  prepareBuildScriptsPath();
  let result: string;
  try {
    result = await binding.install(
      process.argv.slice(2),
      process.cwd(),
      JSON.stringify(await hostInfo()),
      (method, payload) => host.serve(method, payload),
      (text) => {
        process.stdout.write(text);
      }
    );
  } catch (error: any) {
    throw new BitError(error?.message ?? String(error));
  }
  const { outcome } = JSON.parse(result) as { outcome: 'installed' | 'help' | 'unsupported' };
  if (outcome !== 'installed') return false;
  await logger.exitAfterFlush(0, 'install');
  return true;
}

type NativeInstall = (
  argv: string[],
  cwd: string,
  hostInfo: string,
  host: (method: string, payload: string) => Promise<string>,
  output: (text: string) => void
) => Promise<string>;

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

function findWorkspaceRoot(cwd: string): string | undefined {
  let dir = cwd;
  while (!fs.existsSync(path.join(dir, 'workspace.jsonc'))) {
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
  return dir;
}

async function hostInfo() {
  const [{ GLOBAL_CONFIG }, { getBitVersion }, { findCurrentBvmDir }, coreAspects, { currentDateAndTimeToFileName }] =
    await Promise.all([
      import('@teambit/legacy.constants'),
      import('@teambit/bit.get-bit-version'),
      import('@teambit/bvm.path'),
      import('./rust-install-core-aspects'),
      import('@teambit/legacy.consumer/dist/bitmap-history-file-id.js'),
    ]);
  const chalk = (await import('chalk')).default;
  const { shouldDisableLoader } = await import('@teambit/legacy.logger');
  return {
    ...coreAspects.coreAspectsInfo(),
    bvmDir: findCurrentBvmDir() ?? null,
    nodePath: process.execPath,
    globalConfigDir: GLOBAL_CONFIG,
    bitVersion: getBitVersion(),
    columns: process.stdout.isTTY ? process.stdout.columns : null,
    color: chalk.level > 0,
    loader: !shouldDisableLoader,
    nonInteractive: process.argv.includes('--json'),
    fileId: currentDateAndTimeToFileName(),
  };
}

/** Serves the callbacks components and aspects implement in JavaScript. */
class InstallHost {
  private harmony?: Promise<Harmony>;
  constructor(private root: string) {}

  async serve(method: string, payload: string): Promise<string> {
    const input = JSON.parse(payload);
    switch (method) {
      case 'envPolicy':
        return JSON.stringify(await this.envPolicy(input.envId));
      case 'appTypes':
        return JSON.stringify(await this.appTypes());
      case 'packageJsonProps':
        return JSON.stringify(await this.packageJsonProps(input.envId));
      case 'transformPackageJson':
        return JSON.stringify(await this.transformPackageJson(input.component, input.manifest));
      case 'afterInstall':
        return JSON.stringify(await this.afterInstall(input));
      case 'confirm':
        return JSON.stringify(await this.confirm(input.question));
      default:
        throw new Error(`unknown install host method "${method}"`);
    }
  }

  private async envPolicy(envId: string) {
    if (envId === 'teambit.harmony/node') {
      const { getNodeDependencyPolicy } = await import('@teambit/node/dist/default-dependency-policy.js');
      return getNodeDependencyPolicy();
    }
    const env = await this.env(envId);
    const policy = await env?.getDependencies?.();
    return policy ?? null;
  }

  private async appTypes(): Promise<string[]> {
    const harmony = await this.loadHarmony();
    return harmony.get<any>('teambit.harmony/application').getAppPatterns();
  }

  /** The env's `getPackageJsonProps()` and whether it implements `modifyPackageJson()`. */
  private async packageJsonProps(envId: string) {
    if (envId === 'teambit.harmony/node') {
      const { getCjsPackageJsonProps } = await import('@teambit/typescript/dist/cjs-package-json-props.js');
      return { props: getCjsPackageJsonProps(), modifiesPackageJson: false };
    }
    const env = await this.env(envId);
    return {
      props: env?.getPackageJsonProps?.() ?? {},
      modifiesPackageJson: typeof env?.modifyPackageJson === 'function',
    };
  }

  private async transformPackageJson(componentId: string, manifest: Record<string, any>) {
    const harmony = await this.loadHarmony();
    const workspace = harmony.get<any>('teambit.workspace/workspace');
    const component = await workspace.get(await workspace.resolveComponentId(componentId));
    const env = harmony.get<any>('teambit.envs/envs').getOrCalculateEnv(component).env;
    return env.modifyPackageJson(component, manifest);
  }

  private async env(envId: string) {
    const harmony = await this.loadHarmony();
    const envs = harmony.get<any>('teambit.envs/envs');
    let definition = envs.getEnvDefinitionByStringId(envId);
    if (!definition) {
      const workspace = harmony.get<any>('teambit.workspace/workspace');
      await workspace.loadAspects([envId], false, undefined, { throwOnError: false, hideMissingModuleError: true });
      definition = envs.getEnvDefinitionByStringId(envId);
    }
    return definition?.env;
  }

  private async afterInstall(request: { compile: boolean; writeConfigFiles: boolean; clearCache: boolean }) {
    const harmony = await this.loadHarmony();
    const { shouldDisableLoader } = await import('@teambit/legacy.logger');
    if (!shouldDisableLoader) (await import('@teambit/legacy.loader')).loader.on();
    const workspace = harmony.get<any>('teambit.workspace/workspace');
    const install = harmony.get<any>('teambit.workspace/install');
    const envs = harmony.get<any>('teambit.envs/envs');
    workspace.inInstallContext = true;
    workspace.inInstallAfterPmContext = true;
    try {
      await workspace.clearCache();
      await install.reloadMovedEnvs();
      await install.reloadNonLoadedEnvs();
      let compiled = 0;
      if (request.compile) {
        const { CompilationInitiator } = await import('@teambit/compiler');
        const logger = harmony.get<any>('teambit.harmony/logger').createLogger('teambit.workspace/install');
        const started = process.hrtime();
        logger.setStatusLine('compiling components');
        const results = await harmony
          .get<any>('teambit.compilation/compiler')
          .compileOnWorkspace([], { initiator: CompilationInitiator.Install });
        compiled = results.length;
        logger.consoleSuccess('compiling components', started);
      }
      if (request.writeConfigFiles) await install.tryWriteConfigFiles(false);
      return { oldNonLoadedEnvs: envs.getFailedToLoadEnvs(), compiled };
    } finally {
      workspace.inInstallContext = false;
    }
  }

  private async confirm(question: string): Promise<boolean> {
    const yesno = (await import('yesno')).default;
    return yesno({ question });
  }

  private loadHarmony(): Promise<Harmony> {
    if (!this.harmony) {
      this.harmony = import('./load-bit').then(({ loadBit }) => loadBit(this.root));
    }
    return this.harmony;
  }
}
