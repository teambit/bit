
/** @flow */
import { loadConsumer } from '../../consumer';

export default function remove(name: string, { inline }: { inline: boolean }): Promise<boolean> {
  return loadConsumer().then(box =>
    box.removeBit({ name }, { inline })
  );
}
