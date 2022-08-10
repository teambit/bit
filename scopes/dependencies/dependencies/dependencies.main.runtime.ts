import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { DependencyResolverAspect } from '@teambit/dependency-resolver';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import {
  DependenciesCmd,
  DependenciesDebugCmd,
  DependenciesGetCmd,
  DependenciesSetCmd,
  SetDependenciesFlags,
} from './dependencies-cmd';
import { DependenciesAspect } from './dependencies.aspect';

export class DependenciesMain {
  constructor(private workspace: Workspace) {}

  async setDependency(componentPattern: string, packages: string[], options: SetDependenciesFlags): Promise<string[]> {
    const compIds = await this.workspace.idsByPattern(componentPattern);
    const getDepField = () => {
      if (options.dev) return 'devDependencies';
      if (options.peer) return 'peerDependencies';
      return 'dependencies';
    };
    const packagesObj = packages.reduce((acc, pkg) => {
      const packageSplit = pkg.split('@');
      if (packageSplit.length === 2) {
        acc[packageSplit[0]] = packageSplit[1];
      } else if (packageSplit.length === 3 && pkg.startsWith('@')) {
        // it's a scoped package
        acc[`@${packageSplit[1]}`] = packageSplit[2];
      } else {
        throw new Error(`invalid package "${pkg}" syntax, expected "package@version"`);
      }
      return acc;
    }, {});

    const config = {
      policy: {
        [getDepField()]: packagesObj,
      },
    };
    await Promise.all(
      compIds.map(async (compId) => {
        await this.workspace.addSpecificComponentConfig(compId, DependencyResolverAspect.id, config, true);
      })
    );

    await this.workspace.bitMap.write();

    return compIds.map((compId) => compId.toStringWithoutVersion());
  }

  static slots = [];
  static dependencies = [CLIAspect, WorkspaceAspect];

  static runtime = MainRuntime;

  static async provider([cli, workspace]: [CLIMain, Workspace]) {
    const depsMain = new DependenciesMain(workspace);
    const depsCmd = new DependenciesCmd();
    depsCmd.commands = [new DependenciesGetCmd(), new DependenciesDebugCmd(), new DependenciesSetCmd(depsMain)];
    cli.register(depsCmd);

    return depsMain;
  }
}

DependenciesAspect.addRuntime(DependenciesMain);

export default DependenciesMain;
