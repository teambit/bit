/** @flow */
import { BitObject } from '../../scope/objects';

export type ModelStore = {
  value: any,
  bitObjects?: ?(BitObject[])
};

export default class BaseType {
  _name: string;
  _val: any;

  get name(): string {
    // return the type of val to support primitives without further implementation
    return this._name || typeof this._val;
  }

  set name(name: string) {
    this._name = name;
  }

  // Called when writing the component bit.json to FS
  get value() {
    return this._val;
  }

  setValue(value: any, context: ?Object) {
    this._val = value;
  }

  // get called before saving type to models
  async toStore(): Promise<ModelStore> {
    return {
      value: this.value
    };
  }

  // Called when loading the value from the model
  // Return an instance of the Type
  fromStore(modelValue: any) {
    this.setValue(modelValue);
    return this;
  }

  /**
   * Validate the user input (as written in the bit.json)
   */
  validate(value: any): boolean {
    // eslint-disable-line no-unused-vars
    throw new Error('validate must be implemented');
  }
}
