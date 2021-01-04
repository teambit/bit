import { getIconForFile } from 'vscode-icons-js';

export function getIcon(fileName?: string) {
  if (!fileName) return '';
  const iconName = getIconForFile(fileName);
  const storageLink = 'https://static.bit.dev/file-icons/';
  return `${storageLink}${iconName}`;
}
