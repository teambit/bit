import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { DependencyResolverAspect, DependencyResolverMain } from '@teambit/dependency-resolver';
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
  constructor(private workspace: Workspace, private dependencyResolver: DependencyResolverMain) {}

  async setDependency(
    componentPattern: string,
    packages: string[],
    options: SetDependenciesFlags
  ): Promise<{ changedComps: string[]; addedPackages: Record<string, string> }> {
    const compIds = await this.workspace.idsByPattern(componentPattern);
    const getDepField = () => {
      if (options.dev) return 'devDependencies';
      if (options.peer) return 'peerDependencies';
      return 'dependencies';
    };
    const packagesObj = {};
    await Promise.all(
      packages.map(async (pkg) => {
        const [name, version] = await this.getPackageNameAndVerResolved(pkg);
        packagesObj[name] = version;
      })
    );
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

    return {
      changedComps: compIds.map((compId) => compId.toStringWithoutVersion()),
      addedPackages: packagesObj,
    };
  }

  private async getPackageNameAndVerResolved(pkg: string): Promise<[string, string]> {
    const resolveLatest = async (pkgName: string) => {
      const versionResolver = await this.dependencyResolver.getVersionResolver({});
      const resolved = await versionResolver.resolveRemoteVersion(pkgName, { rootDir: '' });
      if (!resolved.version) throw new Error(`unable to resolve version for ${pkgName}`);
      return resolved.version;
    };
    const [name, version] = this.splitPkgToNameAndVer(pkg);
    const versionResolved = !version || version === 'latest' ? await resolveLatest(name) : version;
    return [name, versionResolved];
  }

  private splitPkgToNameAndVer(pkg: string): [string, string | undefined] {
    const packageSplit = pkg.split('@');
    if (pkg.startsWith('@')) {
      // scoped package
      if (packageSplit.length > 3) throw new Error(`invalid package "${pkg}" syntax, expected "package[@version]"`);
      return [`@${packageSplit[1]}`, packageSplit[2]];
    }
    if (packageSplit.length > 2) throw new Error(`invalid package "${pkg}" syntax, expected "package[@version]"`);
    return [packageSplit[0], packageSplit[1]];
  }

  static slots = [];
  static dependencies = [CLIAspect, WorkspaceAspect, DependencyResolverAspect];

  static runtime = MainRuntime;

  static async provider([cli, workspace, depsResolver]: [CLIMain, Workspace, DependencyResolverMain]) {
    const depsMain = new DependenciesMain(workspace, depsResolver);
    const depsCmd = new DependenciesCmd();
    depsCmd.commands = [new DependenciesGetCmd(), new DependenciesDebugCmd(), new DependenciesSetCmd(depsMain)];
    cli.register(depsCmd);

    return depsMain;
  }
}

DependenciesAspect.addRuntime(DependenciesMain);

export default DependenciesMain;
