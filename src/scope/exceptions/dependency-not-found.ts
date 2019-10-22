import AbstractError from '../../error/abstract-error';

export default class DependencyNotFound extends AbstractError {
  id: string;
  code: number;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  bitJsonPath: string;

  constructor(id: string) {
    super();
    this.code = 127;
    this.id = id;
  }
}
