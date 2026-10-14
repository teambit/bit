import { ComponentID, ComponentIdList } from '@teambit/component-id';
import { tagResultReport, NOTHING_TO_TAG_MSG } from '@teambit/snapping/dist/tag-cmd.js';
import { valid } from 'semver';
import chalk from 'chalk';

/** Hydrate IDs only; the canonical report never needs Consumer/Version instances. */
export function formatRustWorkspaceTag(value: any) {
  if (value === null) return chalk.yellow(NOTHING_TO_TAG_MSG);
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (key) =>
        !['taggedComponents', 'autoTaggedResults', 'newComponents', 'warnings', 'isSoftTag', 'totalComponentsCount'].includes(key)
    ) ||
    value.isSoftTag !== false || !Array.isArray(value.warnings) || value.warnings.some((warning: any) => typeof warning !== 'string') ||
    !Number.isSafeInteger(value.totalComponentsCount) ||
    value.totalComponentsCount < 1 ||
    value.totalComponentsCount > 4096
  )
    throw new Error('native tag report');
  const selected = ids(value.taggedComponents);
  if (selected.some((id) => !id.version || !valid(id.version))) throw new Error('native tag version');
  const added = ids(value.newComponents);
  const selectedSet = new Set(selected.map((id) => id.toStringWithoutVersion()));
  if (added.some((id) => !selectedSet.has(id.toStringWithoutVersion()))) throw new Error('native tag new components');
  if (!Array.isArray(value.autoTaggedResults) || value.autoTaggedResults.length > 4096)
    throw new Error('native tag automatic components');
  const automatic = value.autoTaggedResults.map((row: any) => {
    if (!row || Object.keys(row).some((key) => !['id', 'triggeredBy'].includes(key)))
      throw new Error('native tag automatic component');
    const [id] = ids([row.id]);
    if (!id.version || !valid(id.version)) throw new Error('native automatic tag version');
    const triggeredBy = ids(row.triggeredBy);
    if (!triggeredBy.length || triggeredBy.some((trigger) => !selectedSet.has(trigger.toStringWithoutVersion())))
      throw new Error('native tag trigger');
    return { component: { id }, triggeredBy: ComponentIdList.fromArray(triggeredBy) };
  });
  const automaticIds = ids(automatic.map((row) => row.component.id.toString()));
  const addedSet = new Set(added.map((id) => id.toStringWithoutVersion()));
  for (const id of automaticIds) {
    const overlap = selected.find((component) => component.toStringWithoutVersion() === id.toStringWithoutVersion());
    if (overlap && (!addedSet.has(id.toStringWithoutVersion()) || overlap.toString() !== id.toString()))
      throw new Error('native tag overlapping automatic identity');
  }
  const persisted = new Set([...selected, ...automaticIds].map((id) => id.toStringWithoutVersion()));
  if (value.totalComponentsCount !== persisted.size) throw new Error('native tag component count');
  return tagResultReport({
    taggedComponents: selected.map((id) => ({ id })),
    autoTaggedResults: automatic,
    newComponents: ComponentIdList.fromArray(added),
    warnings: value.warnings,
    isSoftTag: false,
    totalComponentsCount: value.totalComponentsCount,
  } as any);
}

function ids(value: any): ComponentID[] {
  if (!Array.isArray(value) || value.length > 4096) throw new Error('native tag identities');
  const seen = new Set<string>();
  return value.map((text: any) => {
    if (typeof text !== 'string' || text.length > 4096) throw new Error('native tag identity');
    const id = ComponentID.fromString(text);
    const identity = id.toStringWithoutVersion();
    if (seen.has(identity)) throw new Error('native tag duplicate identity');
    seen.add(identity);
    return id;
  });
}
