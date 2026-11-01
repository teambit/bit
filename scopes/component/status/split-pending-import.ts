import type { InvalidComponent } from '@teambit/component';
import { ComponentsPendingImport } from '@teambit/legacy.consumer';

/**
 * components whose objects are missing from the local scope are reported separately (as pending-import),
 * so they shouldn't be listed again as invalid.
 */
export function splitPendingImport(allInvalidComponents: InvalidComponent[]): {
  importPendingComponents: InvalidComponent[];
  invalidComponents: InvalidComponent[];
} {
  const importPendingComponents: InvalidComponent[] = [];
  const invalidComponents: InvalidComponent[] = [];
  allInvalidComponents.forEach((invalidComponent) => {
    if (invalidComponent.err instanceof ComponentsPendingImport) importPendingComponents.push(invalidComponent);
    else invalidComponents.push(invalidComponent);
  });
  return { importPendingComponents, invalidComponents };
}
