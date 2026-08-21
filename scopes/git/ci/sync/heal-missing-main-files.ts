import fs from 'fs-extra';
import path from 'path';
import { formatWarningSummary } from '@teambit/cli';
import type { Logger } from '@teambit/logger';
import type { Workspace } from '@teambit/workspace';
import type { ComponentID } from '@teambit/component-id';
import { ComponentIdList } from '@teambit/component-id';
import { capEntries } from './lane-sync-executor';

/**
 * A `.bitmap` entry whose recorded `mainFile` is no longer on disk cannot be loaded at all — the
 * component loader throws `MainFileRemoved`, and that one entry fails the whole `bit checkout head`
 * the main-scope reconciler runs, so every scheduled run stays red until a human intervenes.
 *
 * The shape is legitimate: a new version moves the component's main file (e.g. an env stops emitting
 * `dist/`, so main goes from `dist/index.d.ts` back to source), the old path is deleted in git, and
 * this repository's `.bitmap` still names it.
 *
 * Two heals, cheapest first:
 *   1. RETARGET — the scope's current version names a main file that IS in this repository, so only
 *      the `.bitmap` pointer is stale. Rewrite it and the component loads; nothing moves on disk.
 *   2. UNTRACK — the scope's current version was read, and the main file it names is not here
 *      either. Drop the entry; main sync's `includeNewFromScope` re-imports the component from the
 *      scope's main. This one writes the component to a fresh directory, so it shows up as a move in
 *      the sync PR.
 *
 * An entry is only ever untracked on a POSITIVE read of the scope's head. A component the scope does
 * not have, or whose objects could not be read (a failed import, a corrupt object), is left exactly
 * as it is and reported: a transient remote failure must not delete a `.bitmap` entry, and the run
 * failing loudly on it is the honest outcome.
 *
 * Deliberately ci-local: making the checkout itself tolerate an unloadable component would change
 * `bit checkout` for every caller passing a "theirs" resolution.
 */
export type MainFileHeal = { id: string; retargetedTo?: string };

/**
 * Fetch the remote head of the stale components. Without it the local scope still holds the version
 * this repository already had — whose main file is the missing one — and every entry would look
 * unrepairable. A failure is not fatal on its own (local objects may still answer), but it must
 * never be mistaken for "the scope says this is gone", and its cause is the first thing an operator
 * needs when a scheduled run starts leaving entries untouched — so it is carried, not swallowed.
 */
async function importHeadsOf(
  workspace: Workspace,
  ids: ComponentID[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await workspace.scope.legacyScope.scopeImporter.importWithoutDeps(
      ComponentIdList.fromArray(ids).toVersionLatest(),
      { cache: false, ignoreMissingHead: true }
    );
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

/**
 * What the scope's current (head) version says the component's main file is. The three outcomes are
 * deliberately distinct: only `read` licenses a destructive heal.
 */
type ScopeMainFile =
  | { status: 'read'; mainFile: string }
  /**
   * nothing on the scope to compare against. Carries which of the three it was, because they send
   * an operator to three different places and a single blanket wording sent this bug's
   * investigation to the wrong one.
   */
  | { status: 'absent'; reason: AbsentReason }
  /** objects could not be read (failed import, corrupt object) — the answer is unknown */
  | { status: 'unreadable'; reason: string };

/** Phrased for the skip line an operator reads, since that is the only consumer. */
type AbsentReason = 'not on the scope' | 'no head on the scope' | 'the head records no main file';

async function mainFileOnScopeHead(workspace: Workspace, id: ComponentID): Promise<ScopeMainFile> {
  const legacyScope = workspace.scope.legacyScope;
  try {
    // Ask for the component, NOT for the version `.bitmap` happens to record. `sources.get` is
    // version-sensitive: when the id carries a version whose Version object is not on the
    // filesystem, it returns `undefined` — indistinguishable here from "the scope has no such
    // component", which sends this function down the `absent` path and makes the heal decline.
    //
    // That is the common case rather than an edge case. The entry being healed is stale by
    // definition, and its recorded version is frequently one this repository never installed: an
    // orphaned tag, or a snap that main has since moved past. `bit install` populates the scope
    // from the `.bitmap` of the branch it ran on, and the main-scope reconciler then checks out a
    // DIFFERENT branch (the sync branch) whose `.bitmap` names that stale version. So the lookup
    // failed precisely when the heal was needed, and the run stayed red reporting a component the
    // scope has as "not on the scope".
    const modelComponent = await legacyScope.getModelComponentIfExist(id.changeVersion(undefined));
    if (!modelComponent) return { status: 'absent', reason: 'not on the scope' };
    const head = modelComponent.getHeadRegardlessOfLaneAsTagOrHash();
    if (!head) return { status: 'absent', reason: 'no head on the scope' };
    const version = await modelComponent.loadVersion(head, legacyScope.objects);
    if (!version?.mainFile) return { status: 'absent', reason: 'the head records no main file' };
    return { status: 'read', mainFile: version.mainFile };
  } catch (e: any) {
    return { status: 'unreadable', reason: e?.message || String(e) };
  }
}

/**
 * Heal every `.bitmap` entry whose main file is missing, and persist. Returns what was healed so the
 * caller can report it; the `.bitmap` change rides the sync commit like any other drift.
 */
export async function healMissingMainFiles(workspace: Workspace, logger: Logger): Promise<MainFileHeal[]> {
  const workspacePath = workspace.path;
  const { bitMap } = workspace.consumer;
  const onDisk = (rootDir: string, file: string) => fs.existsSync(path.join(workspacePath, rootDir, file));

  const stale = bitMap.components.filter((componentMap) => {
    const { rootDir, mainFile } = componentMap;
    return Boolean(rootDir) && Boolean(mainFile) && !onDisk(rootDir as string, mainFile);
  });
  if (!stale.length) return [];

  const headFetch = await importHeadsOf(
    workspace,
    stale.map((componentMap) => componentMap.id)
  );

  const healed: MainFileHeal[] = [];
  const skipped: string[] = [];
  for (const componentMap of stale) {
    const id = componentMap.id.toStringWithoutVersion();
    const onScope = await mainFileOnScopeHead(workspace, componentMap.id);
    if (onScope.status === 'read' && onDisk(componentMap.rootDir as string, onScope.mainFile)) {
      componentMap.mainFile = onScope.mainFile;
      bitMap.markAsChanged();
      healed.push({ id, retargetedTo: onScope.mainFile });
    } else if (onScope.status === 'read') {
      // Positively read, and the file it names is not here either: the whole component is gone from
      // this tree, so the entry cannot be repaired in place.
      bitMap.removeComponent(componentMap.id);
      healed.push({ id });
    } else {
      // Unknown, never assumed: leave the entry and let the checkout fail with its own message.
      skipped.push(`${id} (${onScope.status === 'absent' ? onScope.reason : `unreadable: ${onScope.reason}`})`);
    }
  }
  if (healed.length) await bitMap.write();

  if (skipped.length) {
    logger.consoleWarning(
      `Left ${skipped.length} .bitmap entr(ies) with a missing main file untouched — the scope could not ` +
        `confirm what to repair them to: ${capEntries(skipped).join(', ')}` +
        (headFetch.ok ? '' : `. Fetching their heads failed first: ${headFetch.error}`)
    );
  }

  const retargeted = healed.filter((heal) => heal.retargetedTo);
  const untracked = healed.filter((heal) => !heal.retargetedTo);
  if (retargeted.length) {
    logger.console(
      formatWarningSummary(
        `Repointed ${retargeted.length} .bitmap entr(ies) at the main file the scope's current version ` +
          `records: ${capEntries(retargeted.map((heal) => `${heal.id} -> ${heal.retargetedTo}`)).join(', ')}`
      )
    );
  }
  if (untracked.length) {
    logger.console(
      formatWarningSummary(
        `Untracked ${untracked.length} component(s) whose recorded main file is gone from this repository, ` +
          `so the scope's current version can be written in their place: ` +
          `${capEntries(untracked.map((heal) => heal.id)).join(', ')}`
      )
    );
  }
  return healed;
}
