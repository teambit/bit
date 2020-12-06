import type { ComponentResult } from '@teambit/builder';
import { merge } from 'lodash';

type ComponentIndex = {
  [id: string]: ComponentResult;
};

/**
 * merge `@teambit/builder` ComponentResult arrays.
 * @param srcResults matrix of results to merge.
 */
export function mergeComponentResults(resultMatrix: ComponentResult[][]) {
  if (!resultMatrix.length) return [];

  const srcResults = resultMatrix[0];
  const index = srcResults.reduce<ComponentIndex>((acc, result) => {
    acc[result.component.toString()] = result;
    return acc;
  }, {});

  resultMatrix.forEach((results) => {
    results.forEach((result) => {
      const id = result.component.id.toString();
      let existing = index[id];
      if (!existing) index[result.component.id.toString()] = result;
      existing = result;

      index[id] = {
        warnings: existing.warnings?.concat(result.warnings || []) || [],
        errors: existing.errors?.concat(result.errors || []) || [],
        metadata: merge(existing.metadata || {}, result.metadata || {}),
        component: result.component,
      };
    });
  });

  return Object.values(index);
}
