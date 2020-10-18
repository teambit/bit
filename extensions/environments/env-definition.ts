import { Environment } from './environment';

/**
 * API for component development environment.
 */
export class EnvDefinition {
  constructor(
    /**
     * id of the env.
     */
    readonly id: string,

    /**
     * env instance.
     */
    readonly env: Environment
  ) {}

  /**
   * get icon of the env.
   */
  get icon() {
    // TODO: refactor this away from here.
    const defaultIcon = `https://static.bit.dev/extensions-icons/default.svg`;
    return this.env.icon || defaultIcon;
  }

  /**
   * get the name of the env.
   */
  get name() {
    return this.env.name;
  }

  /**
   * get the description of the env.
   */
  get description() {
    return this.env.description;
  }

  toObject() {
    return {
      id: this.id,
      description: this.description,
      name: this.name,
      icon: this.icon,
    };
  }
}
