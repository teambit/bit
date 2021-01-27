import { BitError } from '@teambit/bit-error';

export class EnvNotFoundInRuntime extends BitError {
  constructor(private id: string) {
    super(`environment with ID: ${id} was not found configured to any of your components`);
  }
}
