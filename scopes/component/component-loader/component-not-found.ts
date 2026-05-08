import { BitError } from '@teambit/bit-error';
import type { ComponentID } from '@teambit/component-id';

/**
 * Thrown when the loader is asked for components that exist neither in the workspace
 * nor in the local scope.
 *
 * The unified loader does not perform implicit network imports. Callers that need
 * to fetch missing components must call `scope.import(ids)` explicitly first, or
 * use the `workspace.getOrImport(id)` helper.
 */
export class ComponentNotFound extends BitError {
  constructor(public readonly missingIds: ComponentID[]) {
    super(ComponentNotFound.formatMessage(missingIds));
  }

  private static formatMessage(missingIds: ComponentID[]): string {
    if (missingIds.length === 0) {
      return 'component(s) not found in the local workspace or scope';
    }
    if (missingIds.length === 1) {
      return `component "${missingIds[0].toString()}" was not found in the local workspace or scope.
to fetch from a remote, run \`bit import ${missingIds[0].toString()}\` or use \`workspace.getOrImport(id)\`.`;
    }
    const list = missingIds.map((id) => `  - ${id.toString()}`).join('\n');
    return `the following ${missingIds.length} component(s) were not found in the local workspace or scope:
${list}
to fetch from a remote, run \`bit import <ids>\` or use \`workspace.getOrImport(id)\`.`;
  }
}
