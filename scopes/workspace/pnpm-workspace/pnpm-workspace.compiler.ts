import fs from 'fs/promises';
import path from 'path';
import type { BuildContext, BuiltTaskResult } from '@teambit/builder';
import type { Compiler, TranspileComponentParams } from '@teambit/compiler';
import type { Logger } from '@teambit/logger';
import type { PnpmScriptTask } from './pnpm-script.task';
import { exists, runPnpm } from './pnpm-utils';

const PNPM_WORKSPACE_MANIFEST = 'pnpm-workspace.yaml';
const DIST_DIR = 'dist';
/** the output of the build and the installed packages - not what the build reads from */
const NON_SOURCE_DIRS = new Set(['node_modules', 'dist', 'build', 'lib', 'coverage', '.bit', '.git']);

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
  distGlobPatterns = [`${DIST_DIR}/**`];
  shouldCopyNonSupportedFiles = false;
  deleteDistDir = false;
  /** by workspace dir, the state of the sources its last successful build ran on */
  private builtSignatures = new Map<string, string>();
  private queue: Promise<unknown> = Promise.resolve();

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
    const sourceDist = path.join(componentDir, this.distDir);
    if (!(await exists(sourceDist))) return;
    const targetDist = path.join(outputDir, this.distDir);
    // pnpm links a workspace package into node_modules, so the output dir may be the package itself
    if (await isSameDir(sourceDist, targetDist)) return;
    await fs.cp(sourceDist, targetDist, { recursive: true, force: true });
  }

  build(buildContext: BuildContext): Promise<BuiltTaskResult> {
    return this.buildTask.execute(buildContext);
  }

  /**
   * components are compiled concurrently, so the checks are queued: otherwise each would read the
   * signature before any build was recorded, and start a build of its own.
   */
  private buildOncePerSourceState(workspaceDir: string): Promise<void> {
    const run = this.queue.then(() => this.buildIfSourcesChanged(workspaceDir));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async buildIfSourcesChanged(workspaceDir: string): Promise<void> {
    const signature = await sourceSignature(workspaceDir);
    if (this.builtSignatures.get(workspaceDir) === signature) return;
    // a failed build is not recorded, the next compile retries it
    this.builtSignatures.delete(workspaceDir);
    const output = await runPnpm(['-r', '--if-present', 'run', 'build'], workspaceDir);
    if (output.trim()) this.logger.console(output.trim());
    this.builtSignatures.set(workspaceDir, signature);
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
async function sourceSignature(workspaceDir: string): Promise<string> {
  const entries: string[] = [];
  const walk = async (dir: string) => {
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    await Promise.all(
      dirents.map(async (dirent) => {
        const fullPath = path.join(dir, dirent.name);
        if (dirent.isDirectory()) {
          if (!NON_SOURCE_DIRS.has(dirent.name)) await walk(fullPath);
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
