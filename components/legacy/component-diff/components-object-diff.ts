import { ComponentID, ComponentIdList } from '@teambit/component-id';
import normalize from 'normalize-path';
import { find, get, isEmpty, isNil } from 'lodash';
import type { ConsumerComponent as Component } from '@teambit/legacy.consumer-component';
import { ExtensionDataList } from '@teambit/legacy.extension-data';
import { componentIdToPackageName } from '@teambit/pkg.modules.component-package-name';
import type { DiffOptions, FieldsDiff } from './components-diff';
import { diffMetadata, type DiffMetadata } from './diff-metadata';
export { getDiffBetweenObjects, prettifyFieldName } from './diff-metadata';

export function componentToPrintableForDiff(component: Component): Record<string, any> {
  const obj: Record<string, any> = {};
  const parsePackages = (packages: Record<string, string>): string[] | null => {
    return !isEmpty(packages) && !isNil(packages)
      ? Object.keys(packages).map((key) => `${key}@${packages[key]}`)
      : null;
  };

  const parseExtensions = (extensions?: ExtensionDataList) => {
    if (!extensions || isEmpty(extensions)) return null;
    return extensions.toConfigArray().map((extension) => extension.id);
  };

  const {
    lang,
    bindingPrefix,
    dependencies,
    devDependencies,
    packageDependencies,
    devPackageDependencies,
    files,
    extensions,
    mainFile,
    deprecated,
  } = component;
  const allDevPackages = {
    ...devPackageDependencies,
  };
  const allPackages = {
    ...packageDependencies,
  };
  const allPeerPackages = {
    ...component.peerPackageDependencies,
  };
  const parsedDevPackageDependencies = parsePackages(allDevPackages) || [];
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const peerPackageDependencies = [].concat(parsePackages(allPeerPackages)).filter((x) => x);
  const overrides = component.overrides.componentOverridesData;

  obj.id = component.id._legacy.toStringWithoutScope();
  obj.packageName = componentIdToPackageName({
    id: component.id,
    bindingPrefix,
    defaultScope: component.id.scope,
    extensions: extensions || new ExtensionDataList(),
  });
  obj.language = lang;
  obj.bindingPrefix = bindingPrefix;
  obj.mainFile = mainFile ? normalize(mainFile) : null;
  obj.dependencies = dependencies
    .toStringOfIds()
    .sort()
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    .concat(parsePackages(allPackages))
    .filter((x) => x);
  obj.devDependencies = devDependencies
    .toStringOfIds()
    .sort()
    .concat(parsedDevPackageDependencies)
    .filter((x) => x);
  obj.peerDependencies = peerPackageDependencies.length ? peerPackageDependencies : undefined;

  obj.files =
    files && !isEmpty(files) && !isNil(files)
      ? files.filter((file) => !file.test).map((file) => normalize(file.relative))
      : null;

  obj.specs =
    files && !isEmpty(files) && !isNil(files) && find(files, (file) => get(file, 'test') === true)
      ? files.filter((file) => file.test).map((file) => normalize(file.relative))
      : null;
  obj.extensions = parseExtensions(extensions);
  obj.deprecated = deprecated ? 'True' : null;
  obj.overridesDependencies = parsePackages(overrides.dependencies);
  obj.overridesDevDependencies = parsePackages(overrides.devDependencies);
  obj.overridesPeerDependencies = parsePackages(overrides.peerDependencies);
  obj.overridesPackageJsonProps = JSON.stringify(component.overrides.componentOverridesPackageJsonData);
  return obj;
}

function componentToPrintableForDiffCommand(component: Component, verbose = false): Record<string, any> {
  const comp = componentToPrintableForDiff(component);
  delete comp.dependencies;
  delete comp.devDependencies;
  delete comp.peerDependencies;
  delete comp.id;
  if (!verbose) {
    delete comp.overridesDependencies;
    delete comp.overridesDevDependencies;
    delete comp.overridesPeerDependencies;
    delete comp.overridesPackageJsonProps;
  }
  return comp;
}

const DEPENDENCY_RESOLVER_ASPECT_ID = 'teambit.dependencies/dependency-resolver';

/**
 * Component-level peer dependencies are not persisted in the legacy `peerDependencies` array of the
 * Version model (`Version.fromComponent` doesn't serialize them) - they live only in the
 * dependency-resolver aspect data. As a result, a component reconstructed from the model has an
 * empty legacy peer array, while the same component loaded from the workspace has it populated by
 * the dependencies-loader. Comparing the legacy arrays directly therefore produces a phantom
 * "peer added" diff even when nothing actually changed (and `bit status` correctly shows no diff).
 *
 * To avoid that, derive the component peers from the authoritative dependency-resolver aspect data
 * (present on both the model and the workspace component) and union it with the legacy array (still
 * relevant for old components tagged before peers were moved to the aspect data).
 */
function getComponentPeerDepsIds(component: Component): ComponentIdList {
  const legacyPeerIds = component.depsIdsGroupedByType.peerDependencies;
  const depResolverData = component.extensions?.findCoreExtension(DEPENDENCY_RESOLVER_ASPECT_ID)?.data;
  const serializedDeps: Array<{ id: string; version?: string; __type?: string; lifecycle?: string }> =
    depResolverData?.dependencies || [];
  const peerComponentIds = serializedDeps
    .filter((dep) => dep.__type === 'component' && dep.lifecycle === 'peer')
    .map((dep) => {
      // the `id` string may be versionless; `version` is the authoritative field. apply it so that
      // peer version upgrades/downgrades are surfaced by the version comparison in
      // `componentDependenciesOutput()`.
      const componentId = ComponentID.fromString(dep.id);
      return dep.version ? componentId.changeVersion(dep.version) : componentId;
    });
  return ComponentIdList.uniqFromArray([...legacyPeerIds, ...peerComponentIds]);
}

export async function diffBetweenComponentsObjects(
  componentLeft: Component,
  componentRight: Component,
  options: DiffOptions
): Promise<FieldsDiff[] | undefined> {
  return diffMetadata(metadata(componentLeft, options.verbose), metadata(componentRight, options.verbose), options);
}

// Defer reads until the formatter needs them, retaining the legacy getter and
// extension sorting order at the public component boundary.
function metadata(component: Component, verbose?: boolean): DiffMetadata {
  return {
    get printable() {
      return componentToPrintableForDiffCommand(component, verbose);
    },
    get version() {
      return component.version;
    },
    get packageDependencies() {
      return component.packageDependencies;
    },
    get devPackageDependencies() {
      return component.devPackageDependencies;
    },
    get peerPackageDependencies() {
      return component.peerPackageDependencies;
    },
    get depsIdsGroupedByType() {
      return component.depsIdsGroupedByType;
    },
    peerDependenciesIds: () => getComponentPeerDepsIds(component),
    extensionConfigs: () => component.extensions.sortById().toConfigObject(),
  };
}
