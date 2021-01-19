import { BitError } from '@teambit/bit-error';

export class IncorrectEnvAspect extends BitError {
  constructor(id: string, envType: string, envId: string) {
    super(`"${id}" is configured in workspace.json, but using the "${envId}" environment, which is type "${envType}".
please make sure to either apply the aspect environment or a composition of the aspect environment for the aspect to load.`);
  }
}
