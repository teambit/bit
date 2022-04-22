import { useQuery } from '@teambit/ui-foundation.ui.react-router.use-query';
import { useParams } from 'react-router-dom';

export type ComponentCompareRouteProps = {
  toVersion?: string;
} & ComponentCompareRouteParams;

export type ComponentCompareRouteParams = {
  componentId: string;
  selected?: string;
};

/**
 *
 * path = /<org>/<scope>/<componentId>/~compare/<selected>
 * variables = to
 */
export function useComponentCompareParams(): ComponentCompareRouteProps {
  const query = useQuery();
  const toVersion = query.get('to') || undefined;
  const { selected, componentId } = useParams<ComponentCompareRouteParams>();

  return { toVersion, selected, componentId };
}
