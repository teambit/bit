import { BitError } from '@teambit/bit-error';

export class EnvNotConfiguredForComponent extends BitError {
  constructor(id: string, componentId?: string) {
    const suffix = componentId ? ` for the component ${componentId}` : '';
    super(`environment with ID: "${id}" is not configured as extension${suffix}.
you probably need to add this environment as a key to your variant in the workspace.jsonc. for example, "your-variant": { "${id}": {} }
`);
  }
}
