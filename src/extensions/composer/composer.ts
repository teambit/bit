import { Watch } from '../watch';
import { BitId as ComponentId } from '../../bit-id';

export default class Composer {
  constructor(private watcher: Watch) {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async serve(componentId: ComponentId) {
    // @ts-ignore
    // const observable = await this.watcher.watch();
    // observable.subscribe(() => {});
  }
}
