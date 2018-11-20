/** @flow */

// import Source from '../scope/models/source';
// import Scope, { BitObject } from  '../context-classes/Scope';
import path from 'path';
import isValidPath from 'is-valid-path';
import { BaseType } from '.';
import { SourceFile } from '../../consumer/component/sources';

type RelativePath = {
  sourceRelativePath: string,
  destinationRelativePath: string
};

type FileDependency = {
  id: ComponentId,
  relativePaths: relativePath[]
};

type FileContext = {
  base: string,
  file?: ?SourceFile
};

export default class File extends BaseType {
  file: SourceFile;
  dependencies: SourceFile[];

  constructor(relativePath: string, context: FileContext = {}) {
    super(relativePath);
    this.name = 'file';
    if (context.file) {
      this.file = context.file;
    } else {
      this.file = _loadFile(relativePath, context);
    }
    // @todo implement
    this.dependencies = [];
  }

  getContents(): string {
    return this.file.contents;
  }

  getDeps() {}

  writeDeps(basePath: ?string) {}

  async store(): ModelStore {
    const source = this.file.toSourceAsLinuxEOL();
    const dependenciesSources = this.dependencies.map(dependency => dependency.toSourceAsLinuxEOL());
    return {
      value: {
        name: this.file.base,
        relativePath: this.file.relative,
        file: source.hash().toString(),
        dependencies: {}
      },
      bitObjects: [source, ...dependenciesSources]
    };

    // const deps: FileDependency[] = this.getDeps();
    // const depsObject = _generateObjectsForDeps(deps);

    // const name: string = this._file.basename;
    // const relative: string = this._file.relative;
    // const object: BitObject = Scope.createObject(this._file.contents);

    // return {
    //   val: {
    //     name: string,
    //     relativePath: PathLinux,
    //     file: Ref('thisFile'),
    //     dependencies: deps
    //   },
    //   files: {
    //     thisFile: 'content',
    //     'deps[0]': 'content2',
    //     'deps[1]': 'content3'
    //   }
    // };
  }

  static loadFromStore(val: ModelStore): File {}

  static validate(filePath): boolean {
    return isValidPath(filePath);
  }
}

function _loadFile(relativePath: string, context: FileContext): File {
  // TODO: support load from bitjson path / ejected config path
  const fullPath = path.join(context.consumerPath, relativePath);
  const file = SourceFile.load(fullPath, undefined, context.base, context.base);
  return file;
}
