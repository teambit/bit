export class SlotRegistry<T> {
  constructor(private registerFn: () => string, readonly map = new Map<string, T>()) {}

  /**
   * get a slot value by extension id.
   */
  get(id: string): T | undefined {
    return this.map.get(id);
  }

  /**
   * return an array of all slots.
   */
  toArray() {
    return Array.from(this.map.entries());
  }

  /**
   * get all registered values.
   */
  values() {
    return Array.from(this.map.values());
  }

  /**
   * register a new entry to the slot registry
   */
  register(value: T) {
    const id = this.registerFn();
    this.map.set(id, value);
  }
}
