export class Config {
  constructor(readonly raw: Map<string, object>) {}

  toObject() {
    return Array.from(this.raw.entries()).reduce<any>((acc, [id, config]) => {
      acc[id] = config;
      return acc;
    }, {});
  }

  /**
   * set an extension config to the registry.
   * @param id extension id
   * @param config plain config object
   */
  set(id: string, config: object) {
    this.raw.set(id, config);
  }

  /**
   * get a config entry
   * @param id extension id.
   */
  get(id: string) {
    return this.raw.get(id);
  }

  /**
   * instantiate from a plain config-like object.
   */
  static from(raw: { [key: string]: object }) {
    return new Config(new Map(Object.entries(raw)));
  }
}
