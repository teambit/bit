import type { Aspect, ExtensionManifest, Harmony } from '@teambit/harmony';
import { Extension } from '@teambit/harmony';

/**
 * harmony keeps the first manifest it got for an aspect-id and ignores later ones, also when the first one never
 * loaded. a manifest holds the paths the aspect was resolved from at that time. e.g. before the first install, a
 * workspace env with root-components is resolved from its link in node_modules (".bit_roots" doesn't exist yet), and
 * fails to load. after the install, its new manifest points to ".bit_roots", but harmony runs the old one, so the env
 * gets the dependencies of the root node_modules instead of its own. replace such an aspect with the new manifest.
 * returns the ids of the replaced aspects.
 */
export function replaceNeverLoadedAspects(harmony: Harmony, aspects: Aspect[]): string[] {
  const graph = harmony.graph;
  const replaced: string[] = [];
  aspects.forEach((aspect) => {
    // harmony.load gets these same aspects as manifests
    const manifest = aspect as unknown as ExtensionManifest;
    const existing: Extension | undefined = graph.get(aspect.id);
    if (!existing || existing.loaded || existing.manifest === manifest) return;
    graph.setNode(aspect.id, new Extension(manifest)); // keeps the edges of the node
    // @ts-ignore the graph caches the extension per id, so the cached one must go as well
    graph.cache.delete(aspect.id);
    replaced.push(aspect.id);
  });
  return replaced;
}
