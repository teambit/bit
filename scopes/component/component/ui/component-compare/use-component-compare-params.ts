import { useQuery } from '@teambit/ui-foundation.ui.react-router.use-query';
import { useParams } from 'react-router-dom';

export type ComponentCompareRouteProps = {
  version?: string;
  toVersion?: string;
} & ComponentCompareRouteParams;

export type ComponentCompareRouteParams = {
  componentId: string;
  selected?: string;
};

/**
 *
 * path = /<org>/<scope>/<componentId>/~compare/<selected>
 * variables = version, to
 */
export function useComponentCompareParams(): ComponentCompareRouteProps {
  const query = useQuery();
  const version = query.get('version') || undefined;
  const toVersion = query.get('to') || undefined;
  const { selected, componentId } = useParams<ComponentCompareRouteParams>();

  return { version, toVersion, selected, componentId };
}
