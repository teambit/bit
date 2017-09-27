// @flow
import path from 'path';

export default class InlineComponent {
  name: string;
  namespace: string;
  file: string;
  compiler: string;
  dependencies: string[];

  constructor({ name, namespace, file, compiler, dependencies }: {
    name: string, namespace: string, file: string, compiler: string, dependencies: string[]
  }) {
    this.name = name;
    this.namespace = namespace;
    this.file = file;
    this.compiler = compiler;
    this.dependencies = dependencies;
  }

  get path(): string {
    return path.join(this.namespace, this.name);
  }

  get filePath(): string {
    return path.join(this.path, this.file);
  }

  static create({ loc, file, compiler, dependencies }): InlineComponent {
    const [namespace, name] = loc.split(path.sep);
    return new InlineComponent({ name, namespace, file, compiler, dependencies });
  }
}
