import { Watch } from '../watch';
import { BitId as ComponentId } from '../bit-id';

export default class Serve {
  constructor(private watcher: Watch) {}

  serve(componentId: ComponentId) {
    const observable = this.watcher.watch();
    observable.subscribe(() => {});
  }
}
