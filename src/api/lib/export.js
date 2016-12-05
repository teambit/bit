/** @flow */
import { loadBox } from '../../box';

export default function create({ name, remote }: { name: string, remote: string}) {
  const box = loadBox();
  const bit = box.get(name);
  // @TODO - the import and the export bit command implemenation
  return bit.export(remote)
          .then(() => box.import(bit, remote))
          .then(() => box.removeBit({ name }, { inline: true }));
}
