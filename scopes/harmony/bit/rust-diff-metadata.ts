import { ComponentID, ComponentIdList } from '@teambit/component-id';
import { sortObjectByKeys } from '@teambit/toolbox.object.sorter';

function componentIds(rows: any[]) {
  return ComponentIdList.fromArray(
    rows.map((row) => (typeof row === 'string' ? ComponentID.fromString(row) : ComponentID.fromObject(row.id)))
  );
}
function configs(extensions: any[], sorted: boolean): Record<string, any> {
  const rows = sorted ? [...extensions].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) : extensions;
  const result = {};
  for (const extension of rows) {
    const config = structuredClone(extension.config ?? {});
    delete config.__specific;
    if (Object.keys(config).length) result[extension.name] = sorted ? sortObjectByKeys(config) : config;
  }
  return result;
}
/** Metadata-only presentation input; filesystem and Version ownership remain native. */
export function rustDiffMetadata(
  target: any,
  model: any,
  value: any,
  peerDependencies: string[],
  packageName: string,
  current = false
) {
  const extensions = value.extensions ?? [];
  if (
    !current &&
    extensions.some((extension) => extension.name === 'teambit.pkg/pkg' && extension.config?.packageJson?.name)
  )
    throw new Error('stored custom package name requires canonical diff');
  const bindingPrefix = model?.bindingPrefix || `@${target.identity.split('/')[0].split('.')[0]}`;
  const groups = {
    dependencies: componentIds(value.dependencies ?? []),
    devDependencies: componentIds(value.devDependencies ?? []),
    peerDependencies: componentIds(peerDependencies),
    extensionDependencies: ComponentIdList.fromArray([]),
  };
  const files = value.files ?? [];
  const configuration = configs(extensions, false);
  const printable = {
    packageName,
    language: current ? 'javascript' : model?.lang || 'javascript',
    bindingPrefix,
    mainFile: value.mainFile || null,
    files: files.length
      ? files.filter((file) => !file.test).map((file) => file.relativePath.replace(/\\/g, '/'))
      : null,
    specs: files.some((file) => file.test === true)
      ? files.filter((file) => file.test).map((file) => file.relativePath.replace(/\\/g, '/'))
      : null,
    extensions: extensions.length || current ? Object.keys(configuration) : null,
    deprecated: model?.deprecated ? 'True' : null,
  };
  const dataPeers =
    extensions.find((extension) => extension.name === 'teambit.dependencies/dependency-resolver')?.data?.dependencies ??
    [];
  const peerIds = dataPeers
    .filter((dep) => dep.__type === 'component' && dep.lifecycle === 'peer')
    .map((dep) => {
      const id = ComponentID.fromString(dep.id);
      return dep.version ? id.changeVersion(dep.version) : id;
    });
  return {
    printable,
    version: target.version,
    packageDependencies: value.packageDependencies ?? {},
    devPackageDependencies: value.devPackageDependencies ?? {},
    peerPackageDependencies: value.peerPackageDependencies ?? {},
    depsIdsGroupedByType: groups,
    peerDependenciesIds: () => ComponentIdList.uniqFromArray([...groups.peerDependencies, ...peerIds]),
    extensionConfigs: () => configs(extensions, true),
  };
}
