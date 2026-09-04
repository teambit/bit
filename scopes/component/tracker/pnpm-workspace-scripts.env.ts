import fs from 'fs-extra';
import path from 'path';
import execa from 'execa';
import { glob } from 'glob';
import type { BuildContext, BuildTask, BuiltTaskResult } from '@teambit/builder';
import type { Compiler, TranspileComponentParams } from '@teambit/compiler';
import type { Environment } from '@teambit/envs';
import type { Logger } from '@teambit/logger';
import type { Workspace } from '@teambit/workspace';
import { TrackerAspect } from './tracker.aspect';
import type { PnpmWorkspaceScriptTask } from './pnpm-workspace-scripts.task';

export class PnpmWorkspaceScriptsCompiler implements Compiler {
  readonly id = `${TrackerAspect.id}/pnpm-workspace-scripts`;
  readonly displayName = 'pnpm workspace package scripts';
  readonly distDir = 'dist';
  readonly distGlobPatterns = ['dist/**'];
  readonly shouldCopyNonSupportedFiles = false;
  readonly deleteDistDir = false;
  private lastBuildSignature?: string;
  private workspaceBuild?: Promise<void>;

  constructor(
    private workspace: Workspace,
    private buildTask: PnpmWorkspaceScriptTask,
    private logger: Logger
  ) {}

  displayConfig(): string {
    return 'package.json#scripts.build';
  }

  version(): string {
    return '1.0.0';
  }

  getDistDir(): string {
    return this.distDir;
  }

  getDistPathBySrcPath(srcPath: string): string {
    return path.join(this.distDir, srcPath);
  }

  isFileSupported(): boolean {
    return true;
  }

  async transpileComponent({ componentDir, outputDir }: TranspileComponentParams): Promise<void> {
    const packageJsonPath = path.join(componentDir, 'package.json');
    if (!(await fs.pathExists(packageJsonPath))) return;
    const manifest = await fs.readJson(packageJsonPath);
    if (!manifest.scripts?.build) return;
    await this.buildWorkspaceOncePerSourceState();
    const sourceDist = path.join(componentDir, this.distDir);
    const targetDist = path.join(outputDir, this.distDir);
    if ((await fs.pathExists(sourceDist)) && path.resolve(sourceDist) !== path.resolve(targetDist)) {
      await fs.copy(sourceDist, targetDist, { overwrite: true });
    }
  }

  build(context: BuildContext): Promise<BuiltTaskResult> {
    return this.buildTask.execute(context);
  }

  /**
   * Bit asks a compiler to transpile one component at a time and does not
   * guarantee dependency order. A raw pnpm workspace does have that ordering,
   * so let pnpm run the workspace build once and only use the per-component
   * callback to collect each project's output.
   */
  private async buildWorkspaceOncePerSourceState(): Promise<void> {
    const signature = await workspaceSourceSignature(this.workspace.path);
    if (this.workspaceBuild && this.lastBuildSignature === signature) return this.workspaceBuild;
    this.lastBuildSignature = signature;
    this.workspaceBuild = (async () => {
      try {
        const result = await execa('pnpm', ['-r', '--if-present', 'run', 'build'], {
          cwd: this.workspace.path,
          all: true,
        });
        if (result.all?.trim()) this.logger.console(result.all.trim());
      } catch (error) {
        this.lastBuildSignature = undefined;
        this.workspaceBuild = undefined;
        throw error;
      }
    })();
    return this.workspaceBuild;
  }
}

async function workspaceSourceSignature(workspacePath: string): Promise<string> {
  const files = await glob('**/*', {
    cwd: workspacePath,
    nodir: true,
    dot: true,
    follow: false,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/lib/**', '**/coverage/**', '.bit/**', '.git/**'],
  });
  const stats = await Promise.all(
    files.sort().map(async (file) => {
      const stat = await fs.stat(path.join(workspacePath, file));
      return `${file}:${stat.size}:${stat.mtimeMs}`;
    })
  );
  return stats.join('|');
}

export class PnpmWorkspaceScriptsEnv implements Environment {
  readonly name = 'pnpm-workspace-scripts';
  readonly description = 'runs conventional package.json scripts in a reconstructed pnpm workspace';
  readonly icon = 'https://static.bit.dev/extensions-icons/default.svg';

  constructor(
    private compiler: PnpmWorkspaceScriptsCompiler,
    private tasks: BuildTask[]
  ) {}

  getCompiler(): Compiler {
    return this.compiler;
  }

  getBuildPipe(): BuildTask[] {
    return this.tasks;
  }

  getDependencies() {
    return {};
  }

  getPackageJsonProps() {
    return {};
  }

  async __getDescriptor() {
    return { type: 'pnpm-workspace-scripts' };
  }
}
