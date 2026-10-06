import { join } from 'path';

export const BUNDLE_UI_TASK_NAME = 'BundleUI';
export const BUNDLE_UI_DIR = 'ui-bundle';
export const UIROOT_ASPECT_IDS = {
  SCOPE: 'teambit.scope/scope',
  WORKSPACE: 'teambit.workspace/workspace',
};
export const BUNDLE_UIROOT_DIR = {
  [UIROOT_ASPECT_IDS.SCOPE]: 'scope',
  [UIROOT_ASPECT_IDS.WORKSPACE]: 'workspace',
};
export const BUNDLE_UI_HASH_FILENAME = '.hash';

/** the roots bit itself ships; anything else registered is not part of the shipped artifact. */
export const KNOWN_UIROOT_ASPECT_IDS = new Set<string>(Object.values(UIROOT_ASPECT_IDS));

/**
 * Both UI roots are bundled by a single rspack compilation, one entry each, so the roots share
 * every chunk they have in common instead of each shipping a full copy of the app. The entry name
 * is the root's short name, and each entry gets its own html naming the chunks only it needs.
 */
export function getUiRootEntryName(uiRootAspectId: string): string {
  // a root outside the two bit ships still gets a usable entry name rather than failing the build.
  return BUNDLE_UIROOT_DIR[uiRootAspectId] || uiRootAspectId.replace(/[^a-zA-Z0-9-]+/g, '-');
}

export function getUiRootHtmlFilename(uiRootAspectId: string): string {
  return `${getUiRootEntryName(uiRootAspectId)}.html`;
}

export function getBundleUiArtifactDirectory() {
  return join('artifacts', BUNDLE_UI_DIR);
}
