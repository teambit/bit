// @flow
import path from 'path';

export default class Component {
  name: string;
  namespace: string;
  scope: string;
  version: string;
  file: string;
  compiler: string;
  dependencies: string[];
  isLocal: boolean;

  constructor({ name, namespace, scope, version, file, compiler, dependencies, isLocal }: {
    name: string,
    namespace: string,
    scope: string,
    version: string,
    file: string,
    compiler: string,
    dependencies: string[],
    isLocal: boolean,
  }) {
    this.name = name;
    this.namespace = namespace;
    this.scope = scope;
    this.version = version;
    this.file = file;
    this.compiler = compiler;
    this.dependencies = dependencies;
    this.isLocal = isLocal;
  }

  get path(): string {
    return path.join(this.namespace, this.name, this.scope, this.version);
  }

  get filePath(): string {
    return path.join(this.path, this.file);
  }

  static create({ loc, file, compiler, dependencies, localScopeName }): Component {
    const [namespace, name, scope, version] = loc.split(path.sep);
    const isLocal = localScopeName === scope;
    return new Component({
      name,
      namespace,
      scope,
      version,
      file,
      compiler,
      dependencies,
      isLocal,
    });
  }
}
