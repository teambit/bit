import { Aspect } from '@teambit/harmony';

export const DependencyResolverAspect = Aspect.create({
  id: 'teambit.dependencies/dependency-resolver',
  dependencies: [],
  defaultConfig: {},
});

const defaultSnapshotAspectId = Object.getOwnPropertyDescriptor(DependencyResolverAspect, 'id')!;

/** Native snapshot preparation must not bypass changed aspect-identity lookups. */
export function hasDefaultDependencyResolverSnapshotId(): boolean {
  const current = Object.getOwnPropertyDescriptor(DependencyResolverAspect, 'id');
  return Boolean(
    current &&
      current.value === defaultSnapshotAspectId.value &&
      current.get === defaultSnapshotAspectId.get &&
      current.set === defaultSnapshotAspectId.set &&
      current.writable === defaultSnapshotAspectId.writable &&
      current.configurable === defaultSnapshotAspectId.configurable &&
      current.enumerable === defaultSnapshotAspectId.enumerable
  );
}
