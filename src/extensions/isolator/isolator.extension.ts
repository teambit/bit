import path from 'path';
import hash from 'object-hash';
import fs from 'fs-extra';
import { map, equals } from 'ramda';
import { CACHE_ROOT, PACKAGE_JSON } from '../../constants';
import { Component } from '../component';
import ConsumerComponent from '../../consumer/component';
import { DependencyResolverExtension } from '../dependency-resolver';
import { Capsule } from './capsule';
import writeComponentsToCapsules from './write-components-to-capsules';
import CapsuleList from './capsule-list';
import { BitId, BitIds } from '../../bit-id';
import PackageJsonFile from '../../consumer/component/package-json-file';
import componentIdToPackageName from '../../utils/bit/component-id-to-package-name';
import { symlinkDependenciesToCapsules } from './symlink-dependencies-to-capsules';
import { DEPENDENCIES_FIELDS } from '../../constants';
import { LoggerExtension, Logger } from '../logger';
import { PathOsBasedAbsolute } from '../../utils/path';

const CAPSULES_BASE_DIR = path.join(CACHE_ROOT, 'capsules'); // TODO: move elsewhere

export type ListResults = {
  workspace: string;
  capsules: string[];
};

export type IsolateComponentsOptions = {
  baseDir?: string;
  installPackages?: boolean;
  packageManager?: string;
  alwaysNew?: boolean;
  name?: string;
};

async function createCapsulesFromComponents(
  components: Component[],
  baseDir: string,
  opts: IsolateComponentsOptions
): Promise<Capsule[]> {
  const capsules: Capsule[] = await Promise.all(
    map((component: Component) => {
      return Capsule.createFromComponent(component, baseDir, opts);
    }, components)
  );
  return capsules;
}

export class IsolatorExtension {
  static id = '@teambit/isolator';
  static dependencies = [DependencyResolverExtension, LoggerExtension];
  static defaultConfig = {};
  static async provide([dependencyResolver, loggerExtension]: [DependencyResolverExtension, LoggerExtension]) {
    const logger = loggerExtension.createLogger(IsolatorExtension.id);
    const isolator = new IsolatorExtension(dependencyResolver, logger);
    return isolator;
  }
  constructor(private dependencyResolver: DependencyResolverExtension, private logger: Logger) {}

  public async isolateComponents(components: Component[], opts: IsolateComponentsOptions): Promise<CapsuleList> {
    const config = Object.assign(
      {
        installPackages: true,
      },
      opts
    );
    const capsulesDir = this.getCapsulesRootDir(opts.baseDir as string); // TODO: move this logic elsewhere
    const capsules = await createCapsulesFromComponents(components, capsulesDir, config);
    const capsuleList = new CapsuleList(
      ...capsules.map((c) => {
        const id = c.component.id;
        return { id, capsule: c };
      })
    );
    const capsulesWithPackagesData = await getCapsulesPreviousPackageJson(capsules);

    const consumerComponents = components.map((c) => c.state._consumer);
    await writeComponentsToCapsules(consumerComponents, capsuleList);
    updateWithCurrentPackageJsonData(capsulesWithPackagesData, capsules);
    if (config.installPackages) {
      const capsulesToInstall: Capsule[] = capsulesWithPackagesData
        .filter((capsuleWithPackageData) => {
          const packageJsonHasChanged = wereDependenciesInPackageJsonChanged(capsuleWithPackageData);
          // @todo: when a component is tagged, it changes all package-json of its dependents, but it
          // should not trigger any "npm install" because they dependencies are symlinked by us
          return packageJsonHasChanged;
        })
        .map((capsuleWithPackageData) => capsuleWithPackageData.capsule);
      await this.dependencyResolver.capsulesInstall(capsulesToInstall, { packageManager: config.packageManager });
      await symlinkDependenciesToCapsules(capsulesToInstall, capsuleList, this.logger);
    }
    // rewrite the package-json with the component dependencies in it. the original package.json
    // that was written before, didn't have these dependencies in order for the package-manager to
    // be able to install them without crushing when the versions don't exist yet
    capsulesWithPackagesData.forEach((capsuleWithPackageData) => {
      capsuleWithPackageData.capsule.fs.writeFileSync(
        PACKAGE_JSON,
        JSON.stringify(capsuleWithPackageData.currentPackageJson, null, 2)
      );
    });

    return capsuleList;
  }

  async list(workspacePath: string): Promise<ListResults> {
    try {
      const workspaceCapsuleFolder = this.getCapsulesRootDir(workspacePath);
      const capsules = await fs.readdir(workspaceCapsuleFolder);
      const capsuleFullPaths = capsules.map((c) => path.join(workspaceCapsuleFolder, c));
      return {
        workspace: workspacePath,
        capsules: capsuleFullPaths,
      };
    } catch (e) {
      if (e.code === 'ENOENT') {
        return { workspace: workspacePath, capsules: [] };
      }
      throw e;
    }
  }

  getCapsulesRootDir(baseDir: string): PathOsBasedAbsolute {
    return path.join(CAPSULES_BASE_DIR, hash(baseDir));
  }
}

type CapsulePackageJsonData = {
  capsule: Capsule;
  currentPackageJson?: Record<string, any>;
  previousPackageJson: Record<string, any> | null;
};

function wereDependenciesInPackageJsonChanged(capsuleWithPackageData: CapsulePackageJsonData): boolean {
  const { previousPackageJson, currentPackageJson } = capsuleWithPackageData;
  if (!previousPackageJson) return true;
  // @ts-ignore at this point, currentPackageJson is set
  return DEPENDENCIES_FIELDS.some((field) => !equals(previousPackageJson[field], currentPackageJson[field]));
}

async function getCapsulesPreviousPackageJson(capsules: Capsule[]): Promise<CapsulePackageJsonData[]> {
  return Promise.all(
    capsules.map(async (capsule) => {
      const packageJsonPath = path.join(capsule.wrkDir, 'package.json');
      let previousPackageJson: any = null;
      try {
        const previousPackageJsonRaw = await capsule.fs.promises.readFile(packageJsonPath, { encoding: 'utf8' });
        previousPackageJson = JSON.parse(previousPackageJsonRaw);
      } catch (e) {
        // package-json doesn't exist in the capsule, that's fine, it'll be considered as a cache miss
      }
      return {
        capsule,
        previousPackageJson,
      };
    })
  );
}

function updateWithCurrentPackageJsonData(capsulesWithPackagesData: CapsulePackageJsonData[], capsules: Capsule[]) {
  capsules.forEach((capsule) => {
    const component: ConsumerComponent = capsule.component.state._consumer;
    const packageJson = getCurrentPackageJson(component, capsule);
    const found = capsulesWithPackagesData.find((c) => c.capsule.component.id.isEqual(capsule.component.id));
    if (!found) throw new Error(`updateWithCurrentPackageJsonData unable to find ${capsule.component.id}`);
    found.currentPackageJson = packageJson.packageJsonObject;
  });
}

function getCurrentPackageJson(component: ConsumerComponent, capsule: Capsule): PackageJsonFile {
  const newVersion = '0.0.1-new';
  const getBitDependencies = (dependencies: BitIds) => {
    return dependencies.reduce((acc, depId: BitId) => {
      const packageDependency = depId.hasVersion() ? depId.version : newVersion;
      const packageName = componentIdToPackageName({
        ...component,
        id: depId,
        isDependency: true,
      });
      acc[packageName] = packageDependency;
      return acc;
    }, {});
  };
  const bitDependencies = getBitDependencies(component.dependencies.getAllIds());
  const bitDevDependencies = getBitDependencies(component.devDependencies.getAllIds());
  const bitExtensionDependencies = getBitDependencies(component.extensions.extensionsBitIds);

  // unfortunately, component.packageJsonFile is not available here.
  // the reason is that `writeComponentsToCapsules` clones the component before writing them
  // also, don't use `PackageJsonFile.createFromComponent`, as it looses the intermediate changes
  // such as postInstall scripts for custom-module-resolution.
  const packageJson = PackageJsonFile.loadFromCapsuleSync(capsule);

  const addDependencies = (packageJsonFile: PackageJsonFile) => {
    packageJsonFile.addDependencies(bitDependencies);
    packageJsonFile.addDevDependencies({
      ...bitDevDependencies,
      ...bitExtensionDependencies,
    });
  };
  addDependencies(packageJson);
  packageJson.addOrUpdateProperty('version', component.id.hasVersion() ? component.id.version : newVersion);
  packageJson.removeDependency('bit-bin');
  return packageJson;
}
