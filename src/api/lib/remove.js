
/** @flow */
import { loadBox } from '../../box';

export default function remove(name: string, { inline }: { inline: boolean }): Promise<boolean> {
  return loadBox().then(box =>
    box.removeBit({ name }, { inline })
  );
}
