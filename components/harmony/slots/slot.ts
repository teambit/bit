import { SlotRegistry } from './registry';

export class Slot {
  static withType<T>() {
    return (registerFn: () => string) => {
      return new SlotRegistry<T>(registerFn);
    };
  }
}

export type SlotProvider<T> = (registerFn: () => string) => SlotRegistry<T>;
