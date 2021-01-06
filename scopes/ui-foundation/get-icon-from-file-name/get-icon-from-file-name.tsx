import { getIconForFile } from 'vscode-icons-js';
import { staticStorageUrl } from '@teambit/base-ui.constants.storage';

export function getIcon(fileName?: string) {
  if (!fileName) return '';
  const iconName = getIconForFile(fileName);
  const storageLink = `${staticStorageUrl}/file-icons/`;
  return `${storageLink}${iconName}`;
}
