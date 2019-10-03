import ExternalErrors from '../../../error/external-errors';

export default class ExternalBuildErrors extends ExternalErrors {
  id: string;

  constructor(id: string, errors: Error[]) {
    super(errors);
    this.id = id;
  }
}
