import { getIcon } from '@teambit/ui-foundation.ui.get-icon-from-file-name';

export type FileIconMatch = (file: string) => string | undefined;

export function getFileIcon(matchers?: FileIconMatch[], fileName?: string): string | undefined {
  if (!fileName) return undefined;
  if (!matchers) return getIcon(fileName);

  for (const matcher of matchers) {
    const icon = matcher(fileName);
    if (icon) return icon;
  }

  // default icons
  return getIcon(fileName);
}
