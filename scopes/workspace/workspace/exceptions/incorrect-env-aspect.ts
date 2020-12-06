import { BitError } from 'bit-bin/dist/error/bit-error';

export class IncorrectEnvAspect extends BitError {
  constructor(id: string, envType: string) {
    super(`"${id}" is configured in workspace.json, but using the "${envType}" environment.
please make sure to either apply the aspect environment or a composition of the aspect environment for the aspect to load.`);
  }
}
