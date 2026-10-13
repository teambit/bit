import semver from 'semver';
import { getNodeDependencyPolicy } from '@teambit/node/dist/default-dependency-policy.js';

const resolver = 'teambit.dependencies/dependency-resolver';
const fields = ['dependencies', 'devDependencies', 'peerDependencies'];
const cores = new Set([
  'teambit.envs/envs',
  resolver,
  'teambit.component/dev-files',
  'teambit.semantics/schema',
  'teambit.pkg/pkg',
  'teambit.preview/preview',
  'teambit.compositions/compositions',
  'teambit.docs/docs',
]);
export function fullIdentity(target: any): string {
  return target.identity + (target.version ? `@${target.version}` : '');
}
export function identityObject(value: string) {
  const [name, version] = value.split('@');
  const slash = name.indexOf('/');
  if (slash < 1) throw new Error('status unscoped dependency');
  return { scope: name.slice(0, slash), name: name.slice(slash + 1), ...(version ? { version } : {}) };
}
function identity(value: any): string {
  if (typeof value === 'string') return value;
  return `${value.scope}/${value.name}${value.version && value.version !== 'latest' ? `@${value.version}` : ''}`;
}
function map(value: any): Record<string, string> {
  if (value === undefined) return {};
  if (
    !value ||
    Array.isArray(value) ||
    typeof value !== 'object' ||
    Object.values(value).some((v) => typeof v !== 'string')
  )
    throw new Error('status complex dependency policy');
  return { ...value };
}
export function dependencyGrammar(values: any): object {
  const strings = new Set<string>();
  const visit = (value: any) => {
    if (typeof value === 'string') strings.add(value);
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  visit(values);
  return Object.fromEntries(
    [...strings].map((value) => [
      value,
      {
        valid: Boolean(semver.valid(value)),
        range: Boolean(semver.validRange(value)),
        coerced: semver.coerce(value)?.version ?? null,
      },
    ])
  );
}
function validateHarmonyVersion(version: any) {
  if (version && !['1.0.0', '2.0.0'].includes(version.schema)) throw new Error('status legacy component');
  for (const dependency of [...(version?.dependencies ?? []), ...(version?.devDependencies ?? [])]) {
    if (
      !dependency.id ||
      typeof dependency.id.scope !== 'string' ||
      !dependency.id.scope ||
      typeof dependency.id.name !== 'string' ||
      !dependency.id.name
    )
      throw new Error('status unscoped dependency');
    if (!Array.isArray(dependency.relativePaths) || dependency.relativePaths.length)
      throw new Error('status relative dependency paths');
  }
}

/** Construct only the built-in Node environment policy; configured runtimes fall back before output. */
export function statusPolicy(context: any, target: any) {
  const model = context.models.find((item) => `${item.scope}/${item.name}` === target.identity);
  if (target.version && !model) throw new Error('status pending import');
  if (!target.version && model) throw new Error('status bitmap normalization required');
  const reference = /^[a-f\d]{40}$/i.test(target.version)
    ? target.version
    : (model?.orphanedVersions?.[target.version] ?? model?.versions?.[target.version]);
  const version = context.versions.find(([hash]) => hash === reference)?.[1];
  validateHarmonyVersion(version);
  if (target.version && !version) throw new Error('status version absent');
  const extensions = statusExtensions(version, target);
  const componentPolicy = extensions.find((extension) => extension.name === resolver)?.config.policy ?? {};
  if (Object.keys(componentPolicy).some((key) => !fields.includes(key))) throw new Error('status component policy');
  const node = getNodeDependencyPolicy();
  const manual = fields.map((field) => map(node[field]));
  const automatic = [{}, {}, Object.fromEntries((node.peers ?? []).map((peer) => [peer.name, peer.supportedRange]))];
  fields.forEach((field, index) => Object.assign(manual[index], map(componentPolicy[field])));
  const overrides = Object.fromEntries(
    fields.flatMap((field, index) => (Object.keys(manual[index]).length ? [[field, manual[index]]] : []))
  );
  const workspacePolicy = context.workspace[resolver]?.policy ?? {};
  if (Object.keys(workspacePolicy).some((key) => !fields.includes(key))) throw new Error('status workspace policy');
  const rootPackages = fields.map((field) => map(context.packageJson?.[field]));
  const workspace = {
    dependencies: { ...map(workspacePolicy.dependencies), ...rootPackages[1], ...rootPackages[0] },
    peerDependencies: { ...map(workspacePolicy.peerDependencies), ...rootPackages[2] },
  };
  const packagePolicy = { dependencies: rootPackages[0], peerDependencies: rootPackages[2] };
  const forcedNames = manual.flatMap((field) => Object.keys(field));
  if (new Set(forcedNames).size !== forcedNames.length) throw new Error('status cross-lifecycle policy');
  for (const name of forcedNames) delete automatic[2][name];
  const modelEntries = (version?.dependencies ?? []).map((dep) => ({
    identity: identity(dep.id),
    packageName: dep.packageName ?? null,
    versionRange: dep.versionRange ?? null,
  }));
  const resolverData = version?.extensions?.find((extension) => extension.name === resolver)?.data;
  const modelDependencies = [...(version?.dependencies ?? []), ...(version?.devDependencies ?? [])].map((dep) =>
    identity(dep.id)
  );
  const input = {
    policies: {
      modelPeers: map(version?.peerPackageDependencies),
      packagePolicy,
      workspacePolicy: workspace,
      automatic,
    },
    finish: {
      manual,
      packageJson: rootPackages,
      selfIdentity: fullIdentity(target),
      environment: {
        policy: {},
        workspace,
        modelComponents: modelEntries,
        modelPackages: map(version?.packageDependencies),
      },
    },
    resolution: {
      sources: { bitmap: context.targets.map(fullIdentity), lane: [], model: modelDependencies, componentConfig: {} },
      extensions: [],
      grammar: {},
      prefix: resolverData?.componentRangePrefix ?? null,
      merge: [{}, {}, {}],
    },
  };
  input.resolution.grammar = dependencyGrammar(input);
  return {
    input,
    extensions,
    modelPackages: ['packageDependencies', 'devPackageDependencies', 'peerPackageDependencies'].map((field) =>
      map(version?.[field])
    ),
    overrides,
    bindingPrefix: model?.bindingPrefix || `@${target.identity.split('.')[0].split('/')[0]}`,
    packageName: packageName(target.identity, model?.bindingPrefix),
  };
}
export function currentStatusMetadata(target: any, policy: any, output: any) {
  const dependencies = output.state.components.map((indices) =>
    indices.map((index) => {
      const entry = output.state.entries[index];
      return {
        id: identityObject(entry.identity),
        relativePaths: [],
        ...(entry.packageName ? { packageName: entry.packageName } : {}),
        ...(entry.versionRange ? { versionRange: entry.versionRange } : {}),
      };
    })
  );
  return {
    mainFile: target.mainFile,
    dependencies: dependencies[0],
    devDependencies: dependencies[1],
    packageDependencies: output.state.packages[0],
    devPackageDependencies: output.state.packages[1],
    peerPackageDependencies: output.state.packages[2],
    bindingPrefix: policy.bindingPrefix,
    overrides: policy.overrides,
    extensions: policy.extensions,
  };
}

function packageName(id: string, storedPrefix?: string): string {
  const scope = id.split('/')[0];
  const prefix = storedPrefix || `@${scope.split('.')[0]}`;
  let name = id.replace(/\//g, '.');
  const owner = `${prefix.replace('@', '')}.`;
  if (prefix !== '@bit' && name.startsWith(owner)) name = name.slice(owner.length);
  return `${prefix}/${name}`;
}

function statusExtensions(version: any, target: any) {
  const storedExtensions = version?.extensions ?? [];
  if (storedExtensions.some((extension) => extension.extensionId || extension.legacyId))
    throw new Error('status model extension dependency');
  const selectedExtensions =
    target.config && !target.config.propagate
      ? storedExtensions.filter((extension) => extension.config?.__specific === true)
      : [
          ...storedExtensions.filter((extension) => extension.config?.__specific === true),
          ...storedExtensions.filter((extension) => extension.config?.__specific !== true),
        ];
  const extensions = selectedExtensions
    .filter((extension, index) => selectedExtensions.findIndex((other) => other.name === extension.name) === index)
    .map((extension) => {
      if (!cores.has(extension.name) || extension.extensionId || extension.legacyId)
        throw new Error('status configured model extension');
      const config = { ...extension.config };
      delete config.__specific;
      if (extension.name !== resolver && Object.keys(config).length)
        throw new Error('status configured core extension');
      if (extension.name === resolver && Object.keys(config).some((key) => key !== 'policy'))
        throw new Error('status resolver configuration');
      if (extension.name === 'teambit.envs/envs' && extension.data?.id !== 'teambit.harmony/node')
        throw new Error('status nondefault environment');
      return { name: extension.name, config: extension.config ?? {} };
    });
  for (const [name, config] of Object.entries(target.config?.extensions ?? {})) {
    if (
      name !== resolver ||
      !config ||
      typeof config !== 'object' ||
      Object.keys(config).some((key) => key !== 'policy')
    )
      throw new Error('status component extension');
    const index = extensions.findIndex((extension) => extension.name === name);
    const extension = { name, config: { ...config, __specific: true } };
    if (index < 0) extensions.unshift(extension);
    else extensions[index] = extension;
  }
  return extensions;
}
