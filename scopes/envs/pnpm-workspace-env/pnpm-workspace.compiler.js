const fs = require('fs/promises');
const path = require('path');
const { PnpmScriptTask } = require('./pnpm-script.task');
const { exists, runPnpm } = require('./utils');

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
class PnpmWorkspaceCompiler {
  constructor(context) {
    this.context = context;
    this.logger = context.createLogger('PnpmCompiler');
    this.id = 'pnpm-workspace-compiler';
    this.displayName = 'pnpm workspace build script';
    this.distDir = DIST_DIR;
    this.distGlobPatterns = [`${DIST_DIR}/**`];
    this.shouldCopyNonSupportedFiles = false;
    this.deleteDistDir = false;
    /** by workspace dir, the state of the sources its last successful build ran on */
    this.builtSignatures = new Map();
    this.queue = Promise.resolve();
  }

  displayConfig() {
    return 'package.json#scripts.build';
  }

  version() {
    return '1.0.0';
  }

  getDistDir() {
    return this.distDir;
  }

  getDistPathBySrcPath(srcPath) {
    return path.join(this.distDir, srcPath);
  }

  isFileSupported() {
    return true;
  }

  async transpileComponent({ componentDir, outputDir }) {
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

  build(buildContext) {
    return PnpmScriptTask.create('build', this.context).execute(buildContext);
  }

  /**
   * components are compiled concurrently, so the checks are queued: otherwise each would read the
   * signature before any build was recorded, and start a build of its own.
   */
  buildOncePerSourceState(workspaceDir) {
    const run = this.queue.then(() => this.buildIfSourcesChanged(workspaceDir));
    this.queue = run.catch(() => undefined);
    return run;
  }

  async buildIfSourcesChanged(workspaceDir) {
    const signature = await sourceSignature(workspaceDir);
    if (this.builtSignatures.get(workspaceDir) === signature) return;
    // a failed build is not recorded, the next compile retries it
    this.builtSignatures.delete(workspaceDir);
    const output = await runPnpm(['-r', '--if-present', 'run', 'build'], workspaceDir);
    if (output.trim()) this.logger.console(output.trim());
    this.builtSignatures.set(workspaceDir, signature);
  }
}

async function findPnpmWorkspaceDir(fromDir) {
  let dir = path.resolve(fromDir);
  for (;;) {
    if (await exists(path.join(dir, PNPM_WORKSPACE_MANIFEST))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

async function isSameDir(dirA, dirB) {
  if (!(await exists(dirB))) return false;
  const [realA, realB] = await Promise.all([fs.realpath(dirA), fs.realpath(dirB)]);
  return realA === realB;
}

/** the path, size and modification time of every source file, in a stable order */
async function sourceSignature(workspaceDir) {
  const entries = [];
  const walk = async (dir) => {
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

module.exports = { PnpmWorkspaceCompiler };
