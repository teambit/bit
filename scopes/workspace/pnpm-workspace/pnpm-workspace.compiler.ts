import fs from 'fs/promises';
import path from 'path';
import type { BuildContext, BuiltTaskResult } from '@teambit/builder';
import type { Compiler, TranspileComponentParams } from '@teambit/compiler';
import type { Logger } from '@teambit/logger';
import type { PnpmScriptTask } from './pnpm-script.task';
import { BUILD_OUTPUT_DIRS } from './pnpm-script.task';
import type { PnpmError } from './pnpm-utils';
import { exists, runPnpm } from './pnpm-utils';

const PNPM_WORKSPACE_MANIFEST = 'pnpm-workspace.yaml';
const DIST_DIR = 'dist';
/** the output of the build and the installed packages - not what the build reads from */
const NON_SOURCE_DIRS = new Set(['node_modules', '.bit', '.git']);
/** where a package's scripts write, next to its package.json. elsewhere, e.g. src/lib, such a dir is a source */
const PACKAGE_OUTPUT_DIRS = new Set([...BUILD_OUTPUT_DIRS, 'coverage']);

/**
 * compiles through the packages' own "build" scripts, in the workspace itself.
 *
 * bit asks a compiler for one component at a time, in no particular order, while a package's build
 * may need its siblings built first. pnpm knows that order, so the whole workspace is built once
 * per state of its sources and each component only collects its own output.
 */
export class PnpmWorkspaceCompiler implements Compiler {
  id = 'pnpm-workspace-compiler';
  displayName = 'pnpm workspace build script';
  distDir = DIST_DIR;
  distGlobPatterns = BUILD_OUTPUT_DIRS.map((dir) => `${dir}/**`);
  shouldCopyNonSupportedFiles = false;
  deleteDistDir = false;
  /** by workspace dir, the state of the sources its last successful build ran on */
  private builtSignatures = new Map<string, string>();
  private queue: Promise<unknown> = Promise.resolve();
  /** by workspace dir, the check queued and not started yet, which a component that asks now can join */
  private pendingChecks = new Map<string, Promise<void>>();

  constructor(
    private buildTask: PnpmScriptTask,
    private logger: Logger
  ) {}

  displayConfig() {
    return 'package.json#scripts.build';
  }

  version() {
    return '1.0.0';
  }

  getDistDir() {
    return this.distDir;
  }

  getDistPathBySrcPath(srcPath: string) {
    return path.join(this.distDir, srcPath);
  }

  isFileSupported() {
    return true;
  }

  async transpileComponent({ componentDir, outputDir }: TranspileComponentParams): Promise<void> {
    const manifest = await fs
      .readFile(path.join(componentDir, 'package.json'), 'utf8')
      .then(JSON.parse)
      .catch(() => undefined);
    if (!manifest?.scripts?.build) return;
    const workspaceDir = await findPnpmWorkspaceDir(componentDir);
    if (!workspaceDir) return;
    await this.buildOncePerSourceState(workspaceDir);
    // pnpm installs the workspace and links each package to its source, where the build wrote its output. bit
    // has no copy of the package to fill, unless one is left from an earlier install of bit's - a broken link too
    if (!(await exists(outputDir))) return;
    // a build may write to any of them, e.g. "lib" for a package whose main is lib/index.js
    await Promise.all(
      BUILD_OUTPUT_DIRS.map(async (dir) => {
        const source = path.join(componentDir, dir);
        if (!(await exists(source))) return;
        const target = path.join(outputDir, dir);
        // pnpm links a workspace package into node_modules, so the output dir may be the package itself
        if (await isSameDir(source, target)) return;
        await fs.cp(source, target, { recursive: true, force: true });
      })
    );
  }

  build(buildContext: BuildContext): Promise<BuiltTaskResult> {
    return this.buildTask.execute(buildContext);
  }

  /**
   * components are compiled concurrently, so the checks are queued: otherwise each would read the
   * signature before any build was recorded, and start a build of its own. the components that ask
   * while a check waits share it, so the sources are not read again for each of them.
   */
  private buildOncePerSourceState(workspaceDir: string): Promise<void> {
    const pending = this.pendingChecks.get(workspaceDir);
    if (pending) return pending;
    const run = this.queue.then(() => {
      this.pendingChecks.delete(workspaceDir);
      return this.buildIfSourcesChanged(workspaceDir);
    });
    this.pendingChecks.set(workspaceDir, run);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async buildIfSourcesChanged(workspaceDir: string): Promise<void> {
    const signature = await sourceSignature(workspaceDir);
    if (this.builtSignatures.get(workspaceDir) === signature) return;
    // a failed build is not recorded, the next compile retries it
    this.builtSignatures.delete(workspaceDir);
    let output: string;
    try {
      output = await runPnpm(['-r', '--if-present', 'run', 'build'], workspaceDir);
    } catch (err: any) {
      // the error says only that the build failed, its output says why
      const failureOutput = (err as PnpmError).output?.trim();
      if (failureOutput) this.logger.console(failureOutput);
      throw err;
    }
    if (output.trim()) this.logger.console(output.trim());
    // the state after the build: a build may write next to the sources, e.g. the tsconfig.tsbuildinfo of "tsc --build"
    this.builtSignatures.set(workspaceDir, await sourceSignature(workspaceDir));
  }
}

async function findPnpmWorkspaceDir(fromDir: string): Promise<string | undefined> {
  let dir = path.resolve(fromDir);
  for (;;) {
    if (await exists(path.join(dir, PNPM_WORKSPACE_MANIFEST))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

async function isSameDir(dirA: string, dirB: string): Promise<boolean> {
  if (!(await exists(dirB))) return false;
  const [realA, realB] = await Promise.all([fs.realpath(dirA), fs.realpath(dirB)]);
  return realA === realB;
}

/** the path, size and modification time of every source file, in a stable order */
export async function sourceSignature(workspaceDir: string): Promise<string> {
  const entries: string[] = [];
  const walk = async (dir: string) => {
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    const isPackageDir = dirents.some((dirent) => dirent.isFile() && dirent.name === 'package.json');
    await Promise.all(
      dirents.map(async (dirent) => {
        const fullPath = path.join(dir, dirent.name);
        if (dirent.isDirectory()) {
          const isOutputDir = isPackageDir && PACKAGE_OUTPUT_DIRS.has(dirent.name);
          if (!NON_SOURCE_DIRS.has(dirent.name) && !isOutputDir) await walk(fullPath);
          return;
        }
        if (!dirent.isFile()) return;
        const stat = await fs.stat(fullPath);
        entries.push(`${path.relative(workspaceDir, fullPath)}:${stat.size}:${stat.mtimeMs}`);
      })
    );
  };
  await walk(workspaceDir);
  return entries.sort().join('|');
}
