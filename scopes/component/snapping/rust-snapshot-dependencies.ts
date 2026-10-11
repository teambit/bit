import { isSnap } from '@teambit/component-version';
import { ComponentID } from '@teambit/component-id';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';
import { DependencyResolverAspect } from '@teambit/dependency-resolver';
import {
  hasRustSnapshotTransactionClass,
  isRustSnapshotTransaction,
  requestRustSnapshotTransaction,
  snapshotPolicyId,
  snapshotPolicyConsumerId,
  hasRustSnapshotFunctionReference,
} from '@teambit/objects';
import type { ComponentRangePrefix } from '@teambit/dependency-resolver';

function dataRecord(value: any): boolean {
  return Boolean(
    value &&
      typeof value === 'object' &&
      [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
      Reflect.ownKeys(value).every((key) => 'value' in Object.getOwnPropertyDescriptor(value, key)!)
  );
}

/** Public range callbacks run in Node; Rust chooses matching targets and ordered mutation patches. */
export async function updateRustSnapshotDependencies(
  components: ConsumerComponent[],
  index: number,
  rangePrefix?: ComponentRangePrefix
): Promise<boolean> {
  if (
    !hasRustSnapshotFunctionReference('SnapshotIsSnap', isSnap) ||
    !isRustSnapshotTransaction() ||
    (rangePrefix !== undefined && typeof rangePrefix !== 'string')
  )
    return false;
  const capture = () => {
    const rows: any[] = [];
    const aliases: Array<{ dependencies: any[]; extensions: any; resolver: any[]; resolverIds: ComponentID[] }> = [];
    for (let offset = 0; offset < components.length; offset += 1) {
      const component = components[offset];
      if (!hasRustSnapshotTransactionClass(component, 'ConsumerComponent')) return undefined;
      const id = snapshotPolicyId(snapshotPolicyConsumerId(component));
      if (!id) return undefined;
      const dependencies: any[] = [];
      for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
        const bucket = Object.getOwnPropertyDescriptor(component, field)?.value;
        if (
          !hasRustSnapshotTransactionClass(bucket, 'Dependencies') ||
          !hasRustSnapshotTransactionClass(bucket.dependencies, 'Array')
        )
          return undefined;
        for (const dependency of bucket.dependencies) {
          if (!hasRustSnapshotTransactionClass(dependency, 'Dependency') || !snapshotPolicyId(dependency.id))
            return undefined;
          dependencies.push(dependency);
        }
      }
      const extensions = component.extensions;
      if (!hasRustSnapshotTransactionClass(extensions, 'ExtensionDataList')) return undefined;
      for (const extension of extensions) {
        if (
          !hasRustSnapshotTransactionClass(extension, 'ExtensionDataEntry') ||
          (extension.extensionId && !snapshotPolicyId(extension.extensionId))
        )
          return undefined;
      }
      for (const dependency of component.extensionDependencies.dependencies) {
        if (!hasRustSnapshotTransactionClass(dependency, 'Dependency') || !snapshotPolicyId(dependency.id))
          return undefined;
        dependencies.push(dependency);
      }
      const entry = extensions.findCoreExtension(DependencyResolverAspect.id);
      if (entry && !dataRecord(entry.data)) return undefined;
      const resolver = entry?.data?.dependencies || [];
      if (!hasRustSnapshotTransactionClass(resolver, 'Array')) return undefined;
      const resolverIds: ComponentID[] = [];
      const resolverRows: object[] = [];
      for (const dep of resolver) {
        if (!dataRecord(dep)) return undefined;
        if (dep.__type !== 'component') {
          resolverRows.push({});
          continue;
        }
        let depId = dep.componentId;
        if (!snapshotPolicyId(depId)) {
          if (!dataRecord(depId) || typeof depId.scope !== 'string' || !depId.scope) return undefined;
          depId = ComponentID.fromObject(depId);
        }
        const projected = snapshotPolicyId(depId);
        if (!projected) return undefined;
        resolverIds[resolverRows.length] = depId;
        resolverRows.push({ type: 'component', componentId: projected });
      }
      rows.push({
        id,
        removed: false,
        rangePrefix: offset === index ? rangePrefix : undefined,
        dependencies: dependencies.map((dep) => ({ id: snapshotPolicyId(dep.id) })),
        extensions: extensions.map((extension) => ({
          id: extension.extensionId && snapshotPolicyId(extension.extensionId),
        })),
        resolver: resolverRows,
      });
      aliases.push({ dependencies, extensions, resolver, resolverIds });
    }
    return { rows, aliases };
  };
  let captured: ReturnType<typeof capture>;
  try {
    captured = capture();
  } catch {
    return false;
  }
  if (!captured) return false;
  const fingerprint = JSON.stringify(captured.rows);
  const reply = await requestRustSnapshotTransaction<any>(
    { kind: 'snapshotDependencyUpdates', components: captured.rows, index },
    (result) =>
      Array.isArray(result.components) &&
      result.components.length === 1 &&
      result.components[0].index === index &&
      ['dependencies', 'extensions', 'resolver'].every((field) => Array.isArray(result.components[0][field]))
  );
  if (!reply) return false;
  let fresh: ReturnType<typeof capture>;
  try {
    fresh = capture();
  } catch {
    return false;
  }
  if (!fresh || fingerprint !== JSON.stringify(fresh.rows)) return false;
  const row = reply.components[0];
  const own = fresh.aliases[index];
  const validIndex = (value: any, length: number) => Number.isSafeInteger(value) && value >= 0 && value < length;
  const validTarget = (patch: any) => validIndex(patch.target, components.length);
  if (
    !row.dependencies.every(
      (patch) =>
        validIndex(patch.index, own.dependencies.length) &&
        validTarget(patch) &&
        (patch.versionRange === undefined || typeof patch.versionRange === 'string')
    ) ||
    !row.extensions.every((patch) => validIndex(patch.index, own.extensions.length) && validTarget(patch)) ||
    !row.resolver.every(
      (patch) =>
        validIndex(patch.index, own.resolver.length) &&
        own.resolverIds[patch.index] &&
        (patch.target === undefined || validTarget(patch))
    )
  )
    return false;
  for (const patch of row.dependencies) {
    const dependency = own.dependencies[patch.index];
    dependency.id = dependency.id.changeVersion(components[patch.target].version);
    if (patch.versionRange !== undefined) dependency.versionRange = patch.versionRange;
  }
  for (const patch of row.extensions) {
    const extension = own.extensions[patch.index];
    extension.extensionId = extension.extensionId.changeVersion(components[patch.target].version);
  }
  for (const patch of row.resolver) {
    const dependency = own.resolver[patch.index];
    const original = own.resolverIds[patch.index];
    const id = patch.target === undefined ? original : original.changeVersion(components[patch.target].version);
    dependency.componentId = id.serialize();
    dependency.id = id.toString();
    dependency.version = id.version;
  }
  return true;
}
