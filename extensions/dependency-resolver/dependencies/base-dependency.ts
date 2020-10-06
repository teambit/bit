import { Dependency, DependencyLifecycleType } from './dependency';

export abstract class BaseDependency implements Dependency {
  constructor(
    private _id: string,
    private _version: string,
    private _type: string,
    private _lifecycle: DependencyLifecycleType
  ) {}

  get id() {
    return this._id;
  }

  get version() {
    return this._version;
  }

  get type() {
    return this._type;
  }

  get lifecycle() {
    return this._lifecycle;
  }

  serialize() {
    return {
      id: this.id,
      version: this.version,
      type: this.type,
      lifecycle: this.lifecycle.toString(),
    };
  }
}
