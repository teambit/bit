import { BitError } from '@teambit/bit-error';

export class EnvNotFound extends BitError {
  constructor(private id: string, private componentId?: string) {
    super(getMessage(id, componentId));
  }
}

function getMessage(id: string, componentId?: string): string {
  const compIdDetails = componentId ? `configured on component ${componentId}` : '';
  return `environment with ID: ${id} ${compIdDetails} was not found`;
}
