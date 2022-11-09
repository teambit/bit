import { BitError } from '@teambit/bit-error';

export class EnvNotConfiguredForComponent extends BitError {
  constructor(id: string, componentId?: string) {
    const suffix = componentId ? ` for the component ${componentId}` : '';
    super(`environment with ID: "${id}" is not configured as extension${suffix}.
you probably need to set this environment to your component(s). for example, "bit env set <component-pattern> ${id}"
`);
  }
}
