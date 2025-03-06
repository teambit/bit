import { ComponentID } from '@teambit/component-id';
import { Dependency, ConsumerComponent, CURRENT_SCHEMA } from '@teambit/legacy.consumer-component';
import { SourceFile } from '@teambit/component.sources';
import { ScopeMain } from '@teambit/scope';
import { ComponentOverrides } from '@teambit/legacy.consumer-config';
import { ExtensionDataList } from '@teambit/legacy.extension-data';
import { Component } from '@teambit/component';
import { DependenciesMain } from '@teambit/dependencies';
import { DependencyResolverMain, VariantPolicyConfigArr } from '@teambit/dependency-resolver';
import { FileData } from './snap-from-scope.cmd';
import { SnappingMain, SnapDataParsed } from './snapping.main.runtime';

export type NewDependency = {
  id: string; // component-id or package-name. e.g. "teambit.react/react" or "lodash".
  version?: string; // version of the package. e.g. "2.0.3". for packages, it is mandatory.
  isComponent?: boolean; // default true. if false, it's a package dependency
  type?: 'runtime' | 'dev' | 'peer'; // default "runtime".
};

export type NewDependencies = NewDependency[];

export type CompData = {
  componentId: ComponentID;
  dependencies: string[];
  aspects: Record<string, any> | undefined;
  message: string | undefined;
  files: FileData[] | undefined;
  mainFile?: string;
  newDependencies?: NewDependencies;
};

/**
 * normally new components are created from a workspace. the files are in the filesystem and the ConsumerComponent
 * object is created from the files.
 * here, we need to create the ConsumerComponent object "on the fly". we don't have workspace, only scope. the files
 * are in-memory (we got them from snap-from-scope command).
 * the way how it is done is by creating a minimal ConsumerComponent object, then convert `Version` object from it,
 * write the version and files into the scope as objects, so then it's possible to load Component object using the
 * ConsumerComponent.
 */
export async function generateCompFromScope(
  scope: ScopeMain,
  depsResolver: DependencyResolverMain,
  compData: CompData,
  snapping: SnappingMain
): Promise<Component> {
  if (!compData.files) throw new Error('generateComp: files are missing');
  const files = compData.files.map((file) => {
    return new SourceFile({ base: '.', path: file.path, contents: Buffer.from(file.content), test: false });
  });
  const id = compData.componentId;
  const extensions = ExtensionDataList.fromConfigObject(compData.aspects || {});
  const { compDeps } = await getCompDeps(scope, depsResolver, compData.newDependencies || []);

  const consumerComponent = new ConsumerComponent({
    mainFile: compData.mainFile || 'index.ts',
    name: compData.componentId.fullName,
    scope: compData.componentId.scope,
    files,
    schema: CURRENT_SCHEMA,
    overrides: await ComponentOverrides.loadNewFromScope(id, files, extensions, compDeps),
    defaultScope: compData.componentId.scope,
    extensions,
    // the dummy data here are not important. this Version object will be discarded later.
    log: {
      message: compData.message || '',
      date: Date.now().toString(),
      username: '',
      email: '',
    },
  });
  // this is needed, otherwise in case of updating envs/aspects, the version-validator throws
  // an error saying "the extension ${extensionId.toString()} is missing from the flattenedDependencies"
  await snapping._addFlattenedDependenciesToComponents([consumerComponent]);

  const { version, files: filesBitObject } =
    await scope.legacyScope.sources.consumerComponentToVersion(consumerComponent);
  const modelComponent = await scope.legacyScope.sources.findOrAddComponent(consumerComponent);
  consumerComponent.version = version.hash().toString();
  await scope.legacyScope.objects.writeObjectsToTheFS([version, modelComponent, ...filesBitObject.map((f) => f.file)]);
  const component = await scope.getManyByLegacy([consumerComponent]);

  return component[0];
}

async function getCompDeps(scope: ScopeMain, depsResolver: DependencyResolverMain, newDeps: NewDependencies) {
  const compIdsData = newDeps.filter((dep) => dep.isComponent);
  const compIdsDataParsed = compIdsData.map((data) => ({
    ...data,
    id: ComponentID.fromString(data.id),
  }));
  const compIds = compIdsDataParsed.map((dep) => (dep.version ? dep.id.changeVersion(dep.version) : dep.id));
  const comps = await scope.getMany(compIds);
  const toDependency = (depId: ComponentID) => {
    const comp = comps.find((c) => c.id.isEqualWithoutVersion(depId));
    if (!comp) throw new Error(`unable to find the specified dependency ${depId.toString()} in the scope`);
    const pkgName = depsResolver.getPackageName(comp);
    return new Dependency(comp.id, [], pkgName);
  };
  const compDeps = compIdsDataParsed.filter((c) => c.type === 'runtime').map((dep) => toDependency(dep.id));
  const compDevDeps = compIdsDataParsed.filter((c) => c.type === 'dev').map((dep) => toDependency(dep.id));
  const compPeerDeps = compIdsDataParsed.filter((c) => c.type === 'peer').map((dep) => toDependency(dep.id));
  return { compDeps, compDevDeps, compPeerDeps };
}

export async function addDeps(
  component: Component,
  snapData: SnapDataParsed,
  scope: ScopeMain,
  deps: DependenciesMain,
  depsResolver: DependencyResolverMain,
  snapping: SnappingMain,
  autoDetect?: VariantPolicyConfigArr
) {
  const newDeps = snapData.newDependencies || [];
  const updateDeps = snapData.dependencies || [];
  const packageDeps = newDeps.filter((dep) => !dep.isComponent);
  const { compDeps, compDevDeps, compPeerDeps } = await getCompDeps(scope, depsResolver, newDeps);
  const toPackageObj = (pkgs: Array<{ id: string; version?: string }>) => {
    return pkgs.reduce((acc, curr) => {
      if (!curr.version) throw new Error(`please specify a version for the package dependency: "${curr.id}"`);
      acc[curr.id] = curr.version;
      return acc;
    }, {});
  };
  const getPkgObj = (type: 'runtime' | 'dev' | 'peer') => {
    return toPackageObj(packageDeps.filter((dep) => dep.type === type));
  };
  const allAutoDeps: { [pkgName: string]: string } = {};
  ['dependencies', 'devDependencies', 'peerDependencies'].forEach((depType) => {
    autoDetect?.[depType]?.forEach((dep) => {
      allAutoDeps[dep.name] = dep.version;
    });
  });

  const manipulateCurrentPkgs = (pkgs: Record<string, string>) => {
    snapData.removeDependencies?.forEach((pkg) => {
      delete pkgs[pkg];
    });
    Object.keys(pkgs).forEach((pkg) => {
      const found = updateDeps.find((d) => d.startsWith(`${pkg}@`));
      if (found) {
        pkgs[pkg] = found.replace(`${pkg}@`, '');
      }
    });
    return pkgs;
  };
  const manipulateCurrentDeps = (currentCompDeps: Dependency[]) => {
    const afterRemoval = currentCompDeps.filter(
      (dep) => !snapData.removeDependencies?.includes(dep.id.toStringWithoutVersion())
    );
    afterRemoval.forEach((dep) => {
      const found = updateDeps.find((d) => d.startsWith(`${dep.id.toStringWithoutVersion()}@`));
      if (found) {
        dep.id = dep.id.changeVersion(found.replace(`${dep.id.toStringWithoutVersion()}@`, ''));
      }
      const foundInAutoDeps = dep.packageName ? allAutoDeps[dep.packageName] : undefined;
      if (foundInAutoDeps) {
        dep.id = dep.id.changeVersion(allAutoDeps[dep.packageName!]);
      }
    });
    return afterRemoval;
  };

  const consumerComponent = component.state._consumer as ConsumerComponent;

  const dependenciesData = {
    allDependencies: {
      dependencies: [...compDeps, ...manipulateCurrentDeps(consumerComponent.dependencies.get())],
      devDependencies: [...compDevDeps, ...manipulateCurrentDeps(consumerComponent.devDependencies.get())],
      peerDependencies: [...compPeerDeps, ...manipulateCurrentDeps(consumerComponent.peerDependencies.get())],
    },
    allPackagesDependencies: {
      packageDependencies: { ...manipulateCurrentPkgs(consumerComponent.packageDependencies), ...getPkgObj('runtime') },
      devPackageDependencies: {
        ...manipulateCurrentPkgs(consumerComponent.devPackageDependencies),
        ...getPkgObj('dev'),
      },
      peerPackageDependencies: {
        ...manipulateCurrentPkgs(consumerComponent.peerPackageDependencies),
        ...getPkgObj('peer'),
      },
    },
  };

  // add the dependencies to the legacy ConsumerComponent object
  // it takes care of both: given dependencies (from the cli) and the overrides, which are coming from the env.
  await deps.loadDependenciesFromScope(consumerComponent, dependenciesData);

  await snapping.UpdateDepsAspectsSaveIntoDepsResolver(component, updateDeps);
}
