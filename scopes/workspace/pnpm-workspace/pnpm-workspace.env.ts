import type { BuildTask } from '@teambit/builder';
import type { Environment } from '@teambit/envs';
import type { PnpmWorkspaceCompiler } from './pnpm-workspace.compiler';

export const PnpmWorkspaceEnvType = 'pnpm-workspace';

export type PnpmWorkspaceTooling = { compiler: PnpmWorkspaceCompiler; buildTasks: BuildTask[] };

/**
 * the env of the packages of a pnpm workspace adopted by "bit pnpm sync". it has no tooling of its
 * own: compiling, building, testing and linting run the packages' own package.json scripts, with
 * pnpm, across the whole workspace.
 *
 * a core env, so it comes with bit: a workspace, a clone of it, or another pnpm workspace importing its
 * packages loads it with nothing to install. what it does - run the scripts the packages define - is
 * the same for every workspace, so it is not configured per component.
 */
export class PnpmWorkspaceEnv implements Environment {
  name = 'pnpm-workspace';

  icon = 'https://static.bit.dev/extensions-icons/default.svg';

  description = "runs the pnpm workspace packages' own package.json scripts";

  private tooling?: PnpmWorkspaceTooling;

  /**
   * the tooling is made when first asked for, so a command that neither compiles nor builds, "bit --help"
   * included, does not load its modules
   */
  constructor(private createTooling: () => PnpmWorkspaceTooling) {}

  getCompiler() {
    return this.getTooling().compiler;
  }

  getBuildPipe(): BuildTask[] {
    return this.getTooling().buildTasks;
  }

  private getTooling(): PnpmWorkspaceTooling {
    this.tooling ??= this.createTooling();
    return this.tooling;
  }

  async __getDescriptor() {
    return {
      type: PnpmWorkspaceEnvType,
    };
  }
}
