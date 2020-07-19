import { ComponentID } from './id';
import { capitalize } from '../utils/capitalize';

export class ComponentMeta {
  constructor(
    /**
     * id the component.
     */
    readonly id: ComponentID
  ) {}

  /**
   * display name of the component.
   */
  get displayName() {
    const tokens = this.id.name.split('-').map((token) => capitalize(token));
    return tokens.join(' ');
  }

  toObject() {
    return {
      id: this.id.toObject(),
    };
  }

  static from(object: { [key: string]: any }) {
    return new ComponentMeta(ComponentID.fromObject(object.id));
  }
}
