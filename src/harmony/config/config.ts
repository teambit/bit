import { Serializable } from './types';

/**
 * definition of the an extension config.
 */
export type ConfigProps<T extends Serializable> = {
  /**
   * default element configuration value. must be serializable.
   */
  [name: string]: T;
};

export class Config<T> {
  constructor(
    /**
     * props of the extension config
     */
    private props: ConfigProps<T>
  ) {}

  get(name: string) {
    return this.props[name];
  }

  set(name: string, config: T) {
    this.props[name] = config;
  }

  /**
   * Assign config for multiple extensions
   *
   * @param {ConfigProps<T>} props
   * @memberof Config
   */
  assign(props: ConfigProps<T>) {
    Object.assign(this.props, props);
  }
}
