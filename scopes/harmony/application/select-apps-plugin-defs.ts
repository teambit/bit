import { groupBy } from 'lodash';
import type { PluginDefinition } from '@teambit/aspect-loader';

export type PluginDefsByAspectId = Array<[string, PluginDefinition[]]>;

/**
 * aspect-ids of loaded extensions are either core-aspect ids, which have no version, or "<scope>/<name>@<version>".
 */
function idWithoutVersion(aspectId: string): string {
  const versionSeparatorIndex = aspectId.indexOf('@');
  return versionSeparatorIndex === -1 ? aspectId : aspectId.slice(0, versionSeparatorIndex);
}

/**
 * harmony registers extensions by their full id, including the version. as a result, when two versions of the same
 * aspect are loaded (e.g. a component uses the latest snap of an app-type aspect, while another aspect it depends on
 * is pinned to an older version of it), both providers run and both register the same app-type.
 * the app file then matches both plugin-defs and is registered to the app-slot twice, where the last registration
 * overwrites the previous one (`SlotRegistry.register` sets the value by the registering extension id), so the app
 * could end up being built by an outdated implementation of the app-type.
 *
 * only defs of the same aspect (regardless of its version) with the same pattern compete with each other. defs that
 * were registered by other aspects are always kept, also when they happen to use the same pattern.
 * out of the competing versions, the one that the component itself uses is preferred (its aspect-list is the
 * authoritative source for the component being built), and when none of them is in the component's aspect-list, the
 * first registered one is used.
 */
export function selectAppsPluginDefs(
  defsByAspectId: PluginDefsByAspectId,
  appTypesPatterns: string[],
  componentAspectIds: string[]
): PluginDefinition[] {
  const selected = new Map<string, { defs: PluginDefinition[]; usedByComponent: boolean }>();
  defsByAspectId.forEach(([aspectId, defs]) => {
    const appDefs = defs.filter((def) => appTypesPatterns.includes(def.pattern.toString()));
    if (!appDefs.length) return;
    const usedByComponent = componentAspectIds.includes(aspectId);
    const defsPerPattern = groupBy(appDefs, (def) => def.pattern.toString());
    Object.entries(defsPerPattern).forEach(([pattern, patternDefs]) => {
      const key = `${idWithoutVersion(aspectId)}::${pattern}`;
      const alreadySelected = selected.get(key);
      if (alreadySelected && (alreadySelected.usedByComponent || !usedByComponent)) return;
      selected.set(key, { defs: patternDefs, usedByComponent });
    });
  });
  return Array.from(selected.values()).flatMap(({ defs }) => defs);
}
