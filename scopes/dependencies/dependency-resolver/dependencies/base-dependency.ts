import { DependencySource } from '../policy/variant-policy/variant-policy';
import { Dependency, DependencyLifecycleType, DependencyManifest } from './dependency';

export abstract class BaseDependency implements Dependency {
  _type: string;

  constructor(
    private _id: string,
    private _version: string,
    private _lifecycle: DependencyLifecycleType,
    private _source?: DependencySource
  ) {}

  get id() {
    return this._id;
  }

  set id(newId: string) {
    this._id = newId;
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

  get source() {
    return this._source;
  }

  serialize<SerializedDependency>(): SerializedDependency {
    return ({
      id: this.id,
      version: this.version,
      __type: this.type,
      lifecycle: this.lifecycle.toString(),
      source: this.source,
    } as unknown) as SerializedDependency;
  }

  setVersion(newVersion: string) {
    this._version = newVersion;
  }

  getPackageName() {
    return this.id;
  }

  toManifest(): DependencyManifest {
    const packageName = this.getPackageName?.();
    const version = this.version;
    return {
      packageName,
      version,
    };
  }
}
