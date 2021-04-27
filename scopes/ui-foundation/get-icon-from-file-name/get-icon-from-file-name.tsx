import { getIconForFile } from 'vscode-icons-js';
import { staticStorageUrl } from '@teambit/base-ui.constants.storage';

// TODO: refactor there. never use verbs to describe components. in this case the component.
// better create something like "vscode-icons"
export function getIcon(fileName?: string) {
  if (!fileName) return '';
  const iconName = getIconForFile(fileName);
  const storageLink = `${staticStorageUrl}/file-icons/`;
  return `${storageLink}${iconName}`;
}
