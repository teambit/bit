import { Dependency, DependencyLifecycleType, SerializedDependency } from './dependency';

export abstract class BaseDependency implements Dependency {
  _type: string;

  constructor(private _id: string, private _version: string, private _lifecycle: DependencyLifecycleType) {}

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

  serialize<SerializedDependency>(): SerializedDependency {
    return ({
      id: this.id,
      version: this.version,
      __type: this.type,
      lifecycle: this.lifecycle.toString(),
    } as unknown) as SerializedDependency;
  }
}
