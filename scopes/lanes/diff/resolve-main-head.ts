import type { ComponentID } from '@teambit/component-id';
import { ComponentIdList } from '@teambit/component-id';
import { LaneId, DEFAULT_LANE } from '@teambit/lane-id';
import type { ScopeMain } from '@teambit/scope';
import { Ref } from '@teambit/objects';
import { compact } from 'lodash';

/**
 * resolve a component's head hash (snap) on main (the default lane).
 *
 * unlike reading `modelComponent.head` directly, this falls back to the remote default-lane ref
 * (`remoteLanes`), so a base that lives on the remote scope but was never written to the local `head`
 * (e.g. a component on a lane whose main version wasn't fetched) is still found. that ref is populated
 * by a fetch - call {@link importMainHeads} first. returns `undefined` only when the component
 * genuinely has no version on main (a real NEW component), never merely because it isn't local.
 */
export async function getHeadOnMain(scope: ScopeMain, componentId: ComponentID): Promise<string | undefined> {
  const legacyScope = scope.legacyScope;
  const modelComponent = await legacyScope.getModelComponentIfExist(componentId);
  if (modelComponent?.head) return modelComponent.head.toString();
  const scopeName = modelComponent?.scope || componentId.scope;
  if (!scopeName) return undefined;
  const remoteRef = await legacyScope.objects.remoteLanes.getRef(LaneId.from(DEFAULT_LANE, scopeName), componentId);
  return remoteRef?.toString() || undefined;
}

/**
 * fetch main (default-lane) heads + objects from the remote for components whose main head isn't
 * resolvable locally, so a base that lives only on the remote scope can still be diffed/merged.
 *
 * reuses the existing bulk importer (`importWithoutDeps`): versionless ids + `cache: false` force the
 * round-trip and let the remote resolve each head (the local-found short-circuit would otherwise skip
 * the lane's already-present ModelComponent); `ignoreMissingHead` keeps truly-new comps a real NEW.
 * after this resolves, {@link getHeadOnMain} returns the base for components that have one on main.
 */
export async function importMainHeads(scope: ScopeMain, componentIds: ComponentID[]): Promise<void> {
  const missing = compact(
    await Promise.all(
      componentIds.map(async (id) => {
        try {
          if (!scope.isExported(id)) return undefined; // no remote to ask
          const head = await getHeadOnMain(scope, id);
          // skip only when the base is fully available locally: a resolvable head whose object is present.
          // otherwise import — the head may be unresolvable simply because the default-lane ref was never
          // fetched (the remote can still have a main version), or it resolves to an object not present
          // locally. `ignoreMissingHead` in the import keeps a genuinely-new component (no main version on
          // the remote) a real NEW after the fetch finds nothing.
          if (head && (await scope.legacyScope.objects.has(Ref.from(head)))) return undefined;
          return id.changeVersion(undefined);
        } catch (err: any) {
          // the whole function is a best-effort prefetch — a failed local head/object lookup for ONE
          // component (corrupt ref, fs hiccup) must not reject the Promise.all and abort the entire
          // lane diff. treat the component as missing so the import below still gets a chance.
          scope.logger.debug(
            `importMainHeads: resolving local main head of ${id.toString()} failed, treating as missing: ${err?.message || err}`
          );
          return id.changeVersion(undefined);
        }
      })
    )
  );
  if (!missing.length) return;
  try {
    await scope.legacyScope.scopeImporter.importWithoutDeps(ComponentIdList.fromArray(missing), {
      cache: false,
      includeVersionHistory: true,
      ignoreMissingHead: true,
      reason: 'to resolve the base on main for components absent from the local scope',
    });
  } catch (err: any) {
    // best-effort pre-fetch: a base on main may be genuinely unavailable on the remote (its object was
    // deleted, or the remote otherwise can't serve it). that must not abort the whole diff/merge - fall
    // back to whatever resolves locally. `getHeadOnMain` still returns a head ref when there is one, and
    // the per-component diff reports a base it can't load as missing ("was not found on the filesystem")
    // instead of throwing. `ignoreMissingHead` already covers truly-new components; this covers the
    // head-exists-but-object-unfetchable case.
    scope.logger.debug(`importMainHeads: best-effort import of main bases failed, continuing: ${err?.message || err}`);
  }
}
