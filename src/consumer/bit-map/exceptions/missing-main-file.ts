import AbstractError from '../../../error/abstract-error';

export default class MissingMainFile extends AbstractError {
  componentId: string;
  mainFile: string;
  files: string[];

  constructor(componentId: string, mainFile: string, files: string[]) {
    super();
    this.componentId = componentId;
    this.mainFile = mainFile;
    this.files = files;
  }
}
