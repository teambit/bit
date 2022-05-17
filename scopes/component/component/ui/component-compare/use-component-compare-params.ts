import { useQuery } from '@teambit/ui-foundation.ui.react-router.use-query';
import { useParams } from 'react-router-dom';

export type ComponentCompareRouteProps = {
  baseVersion?: string;
} & ComponentCompareRouteParams;

export type ComponentCompareRouteParams = {
  componentId: string;
  selectedFile?: string;
  compositionBase?: string;
  compositionCompare?: string;
};

/**
 * path = /<org>/<scope>/<componentId>/<~compare | ~compareDependencies | ~compareCode | ~compareAspects>/<selected | (compositionBase, compositionCompare)
 * variables = base, version
 */
export function useComponentCompareParams(): ComponentCompareRouteProps {
  const query = useQuery();

  const baseVersion = query.get('base') || undefined;

  const { selectedFile, componentId, compositionBase, compositionCompare } = useParams<ComponentCompareRouteParams>();

  return { baseVersion, componentId, selectedFile, compositionBase, compositionCompare };
}
