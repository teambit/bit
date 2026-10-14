import { ComponentID, ComponentIdList } from '@teambit/component-id';
import { snapResultReport } from '@teambit/snapping/dist/snap-cmd.js';
import { NOTHING_TO_SNAP_MSG } from '@teambit/legacy.constants';
import chalk from 'chalk';

/** Hydrate IDs only; the canonical report never needs Consumer/Version instances. */
export function formatRustWorkspaceSnap(value: any) {
  if (value === null) return chalk.yellow(NOTHING_TO_SNAP_MSG);
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (key) =>
        !['snappedComponents', 'autoSnappedResults', 'newComponents', 'laneName', 'totalComponentsCount'].includes(key)
    ) ||
    !(value.laneName === null || typeof value.laneName === 'string') ||
    !Number.isSafeInteger(value.totalComponentsCount) ||
    value.totalComponentsCount < 1 ||
    value.totalComponentsCount > 4096
  )
    throw new Error('native snap report');
  const selected = ids(value.snappedComponents);
  const added = ids(value.newComponents);
  const selectedSet = new Set(selected.map((id) => id.toStringWithoutVersion()));
  if (added.some((id) => !selectedSet.has(id.toStringWithoutVersion()))) throw new Error('native snap new components');
  if (!Array.isArray(value.autoSnappedResults) || value.autoSnappedResults.length > 4096)
    throw new Error('native snap automatic components');
  const automatic = value.autoSnappedResults.map((row: any) => {
    if (!row || Object.keys(row).some((key) => !['id', 'triggeredBy'].includes(key)))
      throw new Error('native snap automatic component');
    const [id] = ids([row.id]);
    const triggeredBy = ids(row.triggeredBy);
    if (!triggeredBy.length || triggeredBy.some((trigger) => !selectedSet.has(trigger.toStringWithoutVersion())))
      throw new Error('native snap trigger');
    return { component: { id }, triggeredBy: ComponentIdList.fromArray(triggeredBy) };
  });
  const automaticIds = ids(automatic.map((row) => row.component.id.toString()));
  const addedSet = new Set(added.map((id) => id.toStringWithoutVersion()));
  for (const id of automaticIds) {
    const overlap = selected.find((component) => component.toStringWithoutVersion() === id.toStringWithoutVersion());
    if (overlap && (!addedSet.has(id.toStringWithoutVersion()) || overlap.toString() !== id.toString()))
      throw new Error('native snap overlapping automatic identity');
  }
  const persisted = new Set([...selected, ...automaticIds].map((id) => id.toStringWithoutVersion()));
  if (value.totalComponentsCount !== persisted.size) throw new Error('native snap component count');
  return snapResultReport({
    snappedComponents: selected.map((id) => ({ id })),
    autoSnappedResults: automatic,
    newComponents: ComponentIdList.fromArray(added),
    laneName: value.laneName,
    totalComponentsCount: value.totalComponentsCount,
  } as any);
}

function ids(value: any): ComponentID[] {
  if (!Array.isArray(value) || value.length > 4096) throw new Error('native snap identities');
  const seen = new Set<string>();
  return value.map((text: any) => {
    if (typeof text !== 'string' || text.length > 4096) throw new Error('native snap identity');
    const id = ComponentID.fromString(text);
    const identity = id.toStringWithoutVersion();
    if (seen.has(identity)) throw new Error('native snap duplicate identity');
    seen.add(identity);
    return id;
  });
}
