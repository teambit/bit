import { flatten } from 'lodash';
import { getIcon } from '@teambit/ui.get-icon-from-file-name';

// TODO - add fileSlot type. but where should we keep it?
export function getFileIcon(slot: any, fileName?: string): string | undefined {
  if (!fileName) return;
  const fileSlot = flatten(slot?.values());
  const matchSlot: any = fileSlot.find((iconSlot: any) => {
    if (iconSlot.match instanceof RegExp) {
      return iconSlot.match.test(fileName);
    }
    return iconSlot.match(fileName);
  });
  return matchSlot?.icon || getIcon(fileName);
}
