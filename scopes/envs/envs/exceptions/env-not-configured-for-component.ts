import { BitError } from '@teambit/bit-error';

export class EnvNotConfiguredForComponent extends BitError {
  constructor(private id: string, componentId?: string) {
    super(`environment with ID: ${id} is not configured as extension for the component ${componentId}`);
  }
}
