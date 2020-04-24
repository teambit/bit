import { Observable } from 'rxjs';
import WatchComponents from 'bit-bin/consumer/component-ops/watch-components';
import { BitId as ComponentId } from 'bit-bin/bit-id';

export default class Watch extends WatchComponents {
  constructor(private legacyWatcher: WatchComponents) {
    super(true);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async _handleChange(path: string, isNew: boolean): Promise<any> {
    return '';
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async watch(componentIds: ComponentId[] = []) {
    await this.watchAll();

    return new Observable(subscriber => {
      subscriber.next();
    });
  }
}
