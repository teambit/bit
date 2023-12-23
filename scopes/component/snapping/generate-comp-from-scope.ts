import { ComponentID } from '@teambit/component-id';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component';
import { Dependency } from '@teambit/legacy/dist/consumer/component/dependencies';
import { SourceFile } from '@teambit/legacy/dist/consumer/component/sources';
import { ScopeMain } from '@teambit/scope';
import ComponentOverrides from '@teambit/legacy/dist/consumer/config/component-overrides';
import { ExtensionDataList } from '@teambit/legacy/dist/consumer/config';
import { Component } from '@teambit/component';
import { CURRENT_SCHEMA } from '@teambit/legacy/dist/consumer/component/component-schema';
import { DependenciesMain } from '@teambit/dependencies';
import DependencyResolverAspect, { DependencyResolverMain } from '@teambit/dependency-resolver';
import { FileData } from './snap-from-scope.cmd';
import { SnapDataParsed } from './snapping.main.runtime';

export type CompData = {
  componentId: ComponentID;
  dependencies: ComponentID[];
  aspects: Record<string, any> | undefined;
  message: string | undefined;
  files: FileData[] | undefined;
  mainFile?: string;
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
export async function generateCompFromScope(scope: ScopeMain, compData: CompData): Promise<Component> {
  if (!compData.files) throw new Error('generateComp: files are missing');
  const files = compData.files.map((file) => {
    return new SourceFile({ base: '.', path: file.path, contents: Buffer.from(file.content), test: false });
  });
  const id = compData.componentId;
  const extensions = ExtensionDataList.fromConfigObject(compData.aspects || {});

  const consumerComponent = new ConsumerComponent({
    mainFile: compData.mainFile || 'index.ts',
    name: compData.componentId.fullName,
    scope: compData.componentId.scope,
    files,
    schema: CURRENT_SCHEMA,
    overrides: await ComponentOverrides.loadNewFromScope(id, files, extensions),
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
  const { version, files: filesBitObject } = await scope.legacyScope.sources.consumerComponentToVersion(
    consumerComponent
  );
  const modelComponent = scope.legacyScope.sources.findOrAddComponent(consumerComponent);
  consumerComponent.version = version.hash().toString();
  await scope.legacyScope.objects.writeObjectsToTheFS([version, modelComponent, ...filesBitObject.map((f) => f.file)]);
  const component = await scope.getManyByLegacy([consumerComponent]);

  return component[0];
}

export async function addDeps(
  component: Component,
  snapData: SnapDataParsed,
  scope: ScopeMain,
  deps: DependenciesMain,
  depsResolver: DependencyResolverMain
) {
  const newDeps = snapData.newDependencies || [];
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
  const packageDeps = newDeps.filter((dep) => !dep.isComponent);
  const toPackageObj = (pkgs: Array<{ id: string; version?: string }>) => {
    return pkgs.reduce((acc, curr) => {
      if (!curr.version) throw new Error(`please specify a version for the package dependency: "${curr.id}"`);
      acc[curr.id] = curr.version;
      return acc;
    }, {});
  };
  const dependenciesData = {
    allDependencies: {
      dependencies: compDeps,
      devDependencies: compDevDeps,
    },
    allPackagesDependencies: {
      packageDependencies: toPackageObj(packageDeps.filter((dep) => dep.type === 'runtime')),
      devPackageDependencies: toPackageObj(packageDeps.filter((dep) => dep.type === 'dev')),
      peerPackageDependencies: toPackageObj(packageDeps.filter((dep) => dep.type === 'peer')),
    },
  };

  const consumerComponent = component.state._consumer as ConsumerComponent;
  // add the dependencies to the legacy ConsumerComponent object
  // it takes care of both: given dependencies (from the cli) and the overrides, which are coming from the env.
  await deps.loadDependenciesFromScope(consumerComponent, dependenciesData);

  // add the dependencies data to the dependency-resolver aspect
  const dependenciesListSerialized = (await depsResolver.extractDepsFromLegacy(component)).serialize();
  const extId = DependencyResolverAspect.id;
  const data = { dependencies: dependenciesListSerialized };
  const existingExtension = component.config.extensions.findExtension(extId);
  if (!existingExtension) throw new Error('unable to find DependencyResolver extension');
  Object.assign(existingExtension.data, data);
}
