import { GlobalConfig } from '@teambit/harmony';
import { AspectGraph } from '@teambit/harmony';
import { flatten } from 'lodash';
import { RuntimeModuleError } from './exceptions';
import { Aspect } from '../aspect';

const DEFAULT_PREDICATE = (filePath: string, name: string) => {
  return filePath.includes(`.${name}.ts`);
};

export class RuntimeDefinition {
  constructor(
    readonly name: string,
    readonly aspects: Aspect[],
    readonly config: GlobalConfig = {},
    readonly loadFn?: (entries: string[]) => Promise<void>,
    readonly filePredicate: (filePath: string, name: string) => boolean = DEFAULT_PREDICATE
  ) {}

  getFiles(graph: AspectGraph): string[] {
    const allFiles: string[] = flatten(graph.extensions.map((vertex) => vertex.files));
    return allFiles.filter((file) => this.filePredicate(file, this.name));
  }

  getAspects() {
    return this.aspects.filter((aspect) => aspect.files);
  }

  requireAll(graph: AspectGraph) {
    const files = this.getFiles(graph);
    files.forEach((file) => {
      try {
        // eslint-disable-next-line
        require(file);
      } catch (err) {
        throw new RuntimeModuleError(err);
      }
    });
  }
}
