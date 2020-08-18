import { Aspect } from '../aspect';
import { flatten } from 'lodash';
import DependencyGraph from '../extension-graph/extension-graph';
import { RuntimeModuleError } from './exceptions';

export type RuntimeDefProps = {
  name: string;
};

const DEFAULT_PREDICATE = (filePath: string, name: string) => {
  return filePath.includes(`.${name}.ts`);
};

export class RuntimeDefinition {
  constructor(
    readonly name: string,
    readonly loadFn: (entries: string[]) => Promise<void>,
    readonly filePredicate: (filePath: string, name: string) => boolean = DEFAULT_PREDICATE
  ) {}

  getFiles(graph: DependencyGraph) {
    const allFiles = flatten(graph.extensions.map((vertex) => vertex.files));
    return allFiles.filter((file) => this.filePredicate(file, this.name));
  }

  requireAll(graph: DependencyGraph) {
    const files = this.getFiles(graph);
    files.forEach((file) => {
      try {
        require(file);
      } catch (err) {
        throw new RuntimeModuleError(err);
      }
    });
  }

  static create(def: RuntimeDefProps) {
    return new RuntimeDefinition(def.name);
  }
}
