import { ComponentIdList } from '@teambit/component-id';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';
import {
  hasRustSnapshotTransactionClass,
  isRustSnapshotTransaction,
  requestRustSnapshotTransaction,
  snapshotPolicySemver,
  snapshotPolicyId,
  snapshotPolicyConsumerId,
} from '@teambit/objects';
import type { AutoTagResult } from './auto-tag';

type Locator = { kind: 'component'; component: number } | { kind: 'dependency'; component: number; index: number };

/** Retain canonical ID aliases while Rust owns graph construction, traversal and triggering. */
export async function planRustAutoTagInfo(
  components: ConsumerComponent[],
  changed: ComponentIdList
): Promise<AutoTagResult[] | undefined> {
  if (
    !isRustSnapshotTransaction() ||
    !hasRustSnapshotTransactionClass(components, 'Array') ||
    !hasRustSnapshotTransactionClass(changed, 'ComponentIdList')
  )
    return undefined;
  const rows: any[] = [];
  const identities: any[] = [];
  const dependencies: any[][] = [];
  const changedRows: object[] = [];
  const versions: string[] = [];
  for (const id of changed) {
    const projected = snapshotPolicyId(id);
    if (!projected) return undefined;
    changedRows.push(projected);
    if (projected.version) versions.push(projected.version);
  }
  const eligibleComponent = (component: ConsumerComponent): boolean => {
    if (!hasRustSnapshotTransactionClass(component, 'ConsumerComponent')) return false;
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
      const bucket = Object.getOwnPropertyDescriptor(component, field)?.value;
      if (
        !hasRustSnapshotTransactionClass(bucket, 'Dependencies') ||
        !hasRustSnapshotTransactionClass(bucket.dependencies, 'Array')
      )
        return false;
      const items = Object.getOwnPropertyDescriptors(bucket.dependencies);
      if (Reflect.ownKeys(items).length !== bucket.dependencies.length + 1) return false;
      for (let index = 0; index < bucket.dependencies.length; index += 1) {
        if (
          !items[index] ||
          !('value' in items[index]) ||
          !hasRustSnapshotTransactionClass(items[index].value, 'Dependency') ||
          !snapshotPolicyId(items[index].value.id)
        )
          return false;
      }
    }
    const extensions = Object.getOwnPropertyDescriptor(component, 'extensions')?.value;
    if (!hasRustSnapshotTransactionClass(extensions, 'ExtensionDataList')) return false;
    for (const extension of extensions) {
      if (
        !hasRustSnapshotTransactionClass(extension, 'ExtensionDataEntry') ||
        (extension.extensionId && !snapshotPolicyId(extension.extensionId))
      )
        return false;
    }
    return true;
  };
  for (const component of components) {
    if (!eligibleComponent(component)) return undefined;
    const id = snapshotPolicyConsumerId(component);
    if (!id) return undefined;
    const projected = snapshotPolicyId(id);
    if (!projected) return undefined;
    const deps = component.getAllDependencies();
    const ids: any[] = [];
    const projectedDeps: object[] = [];
    for (const dependency of deps) {
      if (!hasRustSnapshotTransactionClass(dependency, 'Dependency')) return undefined;
      const projectedId = snapshotPolicyId(dependency.id);
      if (!projectedId) return undefined;
      ids.push(dependency.id);
      projectedDeps.push(projectedId);
      if (projectedId.version) versions.push(projectedId.version);
    }
    identities.push(id);
    dependencies.push(ids);
    rows.push({ id: projected, dependencies: projectedDeps });
  }
  const semver = snapshotPolicySemver(versions);
  if (!semver) return undefined;
  const validLocator = (locator: Locator): boolean =>
    Boolean(
      locator &&
        Number.isSafeInteger(locator.component) &&
        locator.component >= 0 &&
        locator.component < components.length &&
        (locator.kind === 'component' ||
          (locator.kind === 'dependency' &&
            Number.isSafeInteger(locator.index) &&
            locator.index >= 0 &&
            locator.index < dependencies[locator.component].length))
    );
  const result = await requestRustSnapshotTransaction<{
    results: Array<{ component: number; triggeredBy: Locator[] }>;
  }>(
    { kind: 'snapshotAutoTag', components: rows, changed: changedRows, semver },
    (reply) =>
      Array.isArray(reply.results) &&
      reply.results.length <= components.length &&
      reply.results.every(
        (row) =>
          Number.isSafeInteger(row.component) &&
          row.component >= 0 &&
          row.component < components.length &&
          Array.isArray(row.triggeredBy) &&
          row.triggeredBy.length > 0 &&
          row.triggeredBy.every(validLocator)
      )
  );
  if (!result || !hasRustSnapshotTransactionClass(changed, 'ComponentIdList')) return undefined;
  for (let index = 0; index < components.length; index += 1) {
    const component = components[index];
    if (
      !eligibleComponent(component) ||
      JSON.stringify(snapshotPolicyId(snapshotPolicyConsumerId(component))) !== JSON.stringify(rows[index].id)
    )
      return undefined;
    const current = component.getAllDependencies();
    if (
      current.length !== dependencies[index].length ||
      current.some(
        (dep, offset) =>
          !hasRustSnapshotTransactionClass(dep, 'Dependency') ||
          dep.id !== dependencies[index][offset] ||
          JSON.stringify(snapshotPolicyId(dep.id)) !== JSON.stringify(rows[index].dependencies[offset])
      )
    )
      return undefined;
  }
  if (
    changed.length !== changedRows.length ||
    changed.some((id, index) => JSON.stringify(snapshotPolicyId(id)) !== JSON.stringify(changedRows[index]))
  )
    return undefined;
  return result.results.map((row) => ({
    component: components[row.component],
    triggeredBy: ComponentIdList.fromArray(
      row.triggeredBy.map((locator) =>
        locator.kind === 'component' ? identities[locator.component] : dependencies[locator.component][locator.index]
      )
    ),
  }));
}
