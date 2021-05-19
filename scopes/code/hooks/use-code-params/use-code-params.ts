import { useParams } from 'react-router-dom';
import { useQuery } from '@teambit/ui-foundation.ui.react-router.use-query';

export type CodeRouteParams = {
  componentId: string;
  file: string | undefined;
  version?: string;
};

export function useCodeParams(): CodeRouteParams {
  // TODO - not sure this is the best way to do this. we might want to handle the query params in react-router aspect
  // I think we should have a hook that keeps all qury parms and just overrides a specific one
  const query = useQuery();
  const version = query.get('version') || undefined;
  const codeRouteParams: CodeRouteParams = useParams();
  return { ...codeRouteParams, version };
}
