import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import type { Logger } from '@teambit/logger';
import type { Workspace } from '@teambit/workspace';
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
 *   2. UNTRACK — no usable main file here (the whole component is gone from the tree). Drop the
 *      entry; main sync's `includeNewFromScope` re-imports the component from the scope's main. This
 *      one writes the component to a fresh directory, so it shows up as a move in the sync PR.
 *
 * Deliberately ci-local: making the checkout itself tolerate an unloadable component would change
 * `bit checkout` for every caller passing a "theirs" resolution.
 */
export type MainFileHeal = { id: string; retargetedTo?: string };

/**
 * Fetch the remote head of the stale components. Without it the local scope still holds the version
 * this repository already had — whose main file is the missing one — and every entry would look
 * unrepairable. Mirrors the lane switcher's pre-read import; failures are not fatal (the caller
 * falls back to untracking).
 */
async function importHeadsOf(workspace: Workspace, ids: any[]): Promise<void> {
  try {
    await workspace.scope.legacyScope.scopeImporter.importWithoutDeps(
      ComponentIdList.fromArray(ids).toVersionLatest(),
      { cache: false, ignoreMissingHead: true }
    );
  } catch {
    // best effort
  }
}

/** The main file the scope's current (head) version of the component records, if it can be read. */
async function mainFileOnScopeHead(workspace: Workspace, componentMap: { id: any }): Promise<string | undefined> {
  try {
    const legacyScope = workspace.scope.legacyScope;
    const modelComponent = await legacyScope.getModelComponentIfExist(componentMap.id);
    const head = modelComponent?.getHeadRegardlessOfLaneAsTagOrHash?.() ?? modelComponent?.head?.toString();
    if (!modelComponent || !head) return undefined;
    const version = await modelComponent.loadVersion(head, legacyScope.objects);
    return version?.mainFile;
  } catch {
    // Unreadable objects are not a reason to fail the run; fall through to untracking.
    return undefined;
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

  await importHeadsOf(
    workspace,
    stale.map((componentMap) => componentMap.id)
  );

  const healed: MainFileHeal[] = [];
  for (const componentMap of stale) {
    const id = componentMap.id.toStringWithoutVersion();
    // eslint-disable-next-line no-await-in-loop
    const scopeMainFile = await mainFileOnScopeHead(workspace, componentMap);
    if (scopeMainFile && onDisk(componentMap.rootDir as string, scopeMainFile)) {
      componentMap.mainFile = scopeMainFile;
      bitMap.markAsChanged();
      healed.push({ id, retargetedTo: scopeMainFile });
    } else {
      bitMap.removeComponent(componentMap.id);
      healed.push({ id });
    }
  }
  await bitMap.write();

  const retargeted = healed.filter((heal) => heal.retargetedTo);
  const untracked = healed.filter((heal) => !heal.retargetedTo);
  if (retargeted.length) {
    logger.console(
      chalk.blue(
        `Repointed ${retargeted.length} .bitmap entr(ies) at the main file the scope's current version ` +
          `records: ${capEntries(retargeted.map((heal) => `${heal.id} -> ${heal.retargetedTo}`)).join(', ')}`
      )
    );
  }
  if (untracked.length) {
    logger.console(
      chalk.blue(
        `Untracked ${untracked.length} component(s) whose recorded main file is gone from this repository, ` +
          `so the scope's current version can be written in their place: ` +
          `${capEntries(untracked.map((heal) => heal.id)).join(', ')}`
      )
    );
  }
  return healed;
}
