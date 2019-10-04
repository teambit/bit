import AbstractError from '../../error/abstract-error';

export default class ComponentNotFound extends AbstractError {
  id: string;
  dependentId: string | null | undefined;
  code: number;

  constructor(id: string, dependentId?: string) {
    super();
    this.code = 127;
    this.id = id;
    this.dependentId = dependentId;
  }
}
