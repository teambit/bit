// @flow

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
  dependencies: SourceFile[] = [];

  constructor() {
    super();
    this.name = 'file';
  }

  setValue(value: any, context: ?Object) {
    this._val = value;
    this.loadFile(context);
  }

  loadFile(context: FileContext = {}) {
    if (context.file) {
      this.file = context.file;
    } else {
      this.file = _loadFile(this.value, context);
    }
  }

  getContents(): string {
    return this.file.contents;
  }

  getDeps() {}

  writeDeps(basePath: ?string) {}

  async toStore(): ModelStore {
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
  }

  fromStore(modelValue: any) {
    // @todo: implement
    this.setValue(modelValue.relativePath, modelValue);
    return this;
  }

  validate(filePath): boolean {
    return isValidPath(filePath);
  }
}

function _loadFile(relativePath: string, context: FileContext): File {
  // TODO: support load from bitjson path / ejected config path
  const fullPath = path.join(context.consumerPath, relativePath);
  const file = SourceFile.load(fullPath, undefined, context.base, context.base);
  return file;
}
