import { Watch } from '@bit/bit.core.watch';
import { BitId as ComponentId } from 'bit-bin/dist/bit-id';

export default class Composer {
  constructor(private watcher: Watch) {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async serve(componentId: ComponentId) {
    const observable = await this.watcher.watch();
    observable.subscribe(() => {});
  }
}
