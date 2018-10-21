/** @flow */

export type ModelStore = {
  val: any,
  files?: ?(string[])
};

export default class BaseType {
  _name: string;
  _val: any;

  // Called to create instance from the bit.json value
  constructor(val: ?any) {
    this._val = val || undefined;
  }

  get name(): string {
    // return the type of val to support primitives without further implementation
    return this._name || typeof this._val;
  }

  set name(name: string) {
    this._name = name;
  }

  // Called when writing the component bit.json to FS
  get val() {
    return this._val;
  }

  // Called before saving type to models
  async store(): ModelStore {
    return {
      val: this.val
    };
  }

  // Called when loading the value from the model
  // Return an instance of the Type
  static loadFromStore(modelVal): BaseType {
    return new BaseType(modelVal);
  }

  /**
   * Validate the user input (as written in the bit.json)
   */
  static validate(val): boolean {
    throw new Error('validate must be implemented');
  }
}
