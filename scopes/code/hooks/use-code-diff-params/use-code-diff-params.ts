import { CodeRouteParams } from '@teambit/code.ui.hooks.use-code-params';
import { useQuery } from '@teambit/ui-foundation.ui.react-router.use-query';
import { useParams } from 'react-router-dom';

export type CodeDiffRouteParams = {
  fromVersion?: string;
  toVersion?: string;
} & CodeRouteParams;
/**
 *
 * path = /<org>/<scope>/<componentId>/~codeDiff/file
 * variables = ?to=0.0.562&?from=0.0.555
 */
export function useCodeDiffParams(): CodeDiffRouteParams {
  const query = useQuery();
  const fromVersion = query.get('from') || undefined;
  const toVersion = query.get('to') || undefined;
  const coudeRouteParams = useParams<CodeRouteParams>();

  return { fromVersion, toVersion, ...coudeRouteParams };
}
