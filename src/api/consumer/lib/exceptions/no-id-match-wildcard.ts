import AbstractError from '../../../../error/abstract-error';

export default class NoIdMatchWildcard extends AbstractError {
  idsWithWildcards: string[];

  constructor(idsWithWildcards: string[]) {
    super();
    this.idsWithWildcards = idsWithWildcards;
  }
}
