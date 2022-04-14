import { CodeRouteParams } from '@teambit/code.ui.hooks.use-code-params';
import { useQuery } from '@teambit/ui-foundation.ui.react-router.use-query';
import { useParams } from 'react-router-dom';

export type CodeCompareRouteParams = {
  fromVersion?: string;
  toVersion?: string;
} & CodeRouteParams;
/**
 *
 * path = /<org>/<scope>/<componentId>/~compare/file
 * variables = ?from=0.0.555&?to=0.0.562
 */
export function useCodeCompareParams(): CodeCompareRouteParams {
  const query = useQuery();
  const fromVersion = query.get('from') || undefined;
  const toVersion = query.get('to') || undefined;
  const coudeRouteParams = useParams<CodeRouteParams>();

  return { fromVersion, toVersion, ...coudeRouteParams };
}
