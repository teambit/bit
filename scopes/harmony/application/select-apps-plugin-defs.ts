import type { PluginDefinition } from '@teambit/aspect-loader';

export type PluginDefsByAspectId = Array<[string, PluginDefinition[]]>;

/**
 * harmony registers extensions by their full id, including the version. as a result, when two versions of the same
 * aspect are loaded (e.g. a component uses the latest snap of an app-type aspect, while another aspect it depends on
 * is pinned to an older version of it), both providers run and both register the same app-type.
 * the app file then matches both plugin-defs and is registered to the app-slot twice, where the last registration
 * overwrites the previous one (`SlotRegistry.register` sets the value by the registering extension id), so the app
 * could end up being built by an outdated implementation of the app-type.
 *
 * to keep it deterministic, only one def per pattern is returned, preferring the def that was registered by an
 * aspect-version the component itself uses (its aspect-list is the authoritative source for the component being
 * built). when none of the versions is in the component's aspect-list, the first registered def is used.
 */
export function selectAppsPluginDefs(
  defsByAspectId: PluginDefsByAspectId,
  appTypesPatterns: string[],
  componentAspectIds: string[]
): PluginDefinition[] {
  const selectedPerPattern = new Map<string, { def: PluginDefinition; usedByComponent: boolean }>();
  defsByAspectId.forEach(([aspectId, defs]) => {
    const usedByComponent = componentAspectIds.includes(aspectId);
    defs.forEach((def) => {
      const pattern = def.pattern.toString();
      if (!appTypesPatterns.includes(pattern)) return;
      const selected = selectedPerPattern.get(pattern);
      if (selected && (selected.usedByComponent || !usedByComponent)) return;
      selectedPerPattern.set(pattern, { def, usedByComponent });
    });
  });
  return Array.from(selectedPerPattern.values()).map(({ def }) => def);
}
