import AbstractError from '../../../../error/abstract-error';

export default class MissingMainFileMultipleComponents extends AbstractError {
  componentIds: string[];

  constructor(componentIds: string[]) {
    super();
    this.componentIds = componentIds;
  }
}
