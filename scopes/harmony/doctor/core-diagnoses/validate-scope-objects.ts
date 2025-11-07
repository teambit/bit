import { loadConsumerIfExist } from '@teambit/legacy.consumer';
import { loadScope } from '@teambit/legacy.scope';
import type { ExamineBareResult } from '../diagnosis';
import Diagnosis from '../diagnosis';
import { getRemoteScope } from '../doctor-context';

export const DIAGNOSIS_NAME = 'validate scope objects';

type ComponentWithMissingHead = {
  id: string;
  head: string;
};

export default class ValidateScopeObjects extends Diagnosis {
  name = DIAGNOSIS_NAME;
  description = 'check if all components have their head version objects';
  category = 'scope integrity';

  _formatSymptoms(bareResult: ExamineBareResult): string {
    if (!bareResult.data) throw new Error('ValidateScopeObjects, bareResult.data is missing');
    const { componentsWithMissingHeads } = bareResult.data;
    if (!componentsWithMissingHeads || componentsWithMissingHeads.length === 0) {
      return 'No issues found';
    }
    return `the following components have missing head version objects:\n${componentsWithMissingHeads
      .map((c: ComponentWithMissingHead) => `  ${c.id} (head: ${c.head})`)
      .join('\n')}`;
  }

  _formatManualTreat() {
    return 'The missing objects need to be restored from backups or re-exported from workspaces that have these components.';
  }

  async _runExamine(): Promise<ExamineBareResult> {
    // Check if running against a remote scope
    const remoteScope = getRemoteScope();
    let scope = remoteScope;

    // If not remote, try to get scope locally
    if (!scope) {
      // First try workspace
      const consumer = await loadConsumerIfExist();
      scope = consumer?.scope;

      // If no workspace, try to load bare scope directly
      if (!scope) {
        try {
          scope = await loadScope();
        } catch {
          // Not in a scope, that's fine
          return { valid: true };
        }
      }
    }

    // Get all local components only
    const modelComponents = await scope.list(true);
    const componentsWithMissingHeads: ComponentWithMissingHead[] = [];

    // Check each component
    for (const modelComponent of modelComponents) {
      const head = modelComponent.getHead();
      if (!head) continue;

      // Check if the head version object exists
      const headVersion = await scope.objects.load(head, false);
      if (!headVersion) {
        componentsWithMissingHeads.push({
          id: modelComponent.id(),
          head: head.toString(),
        });
      }
    }

    return {
      valid: componentsWithMissingHeads.length === 0,
      data: {
        componentsWithMissingHeads,
        totalComponents: modelComponents.length,
      },
    };
  }
}
