import { useParams } from 'react-router-dom';

export type CodeRouteParams = {
  componentId: string;
  file: string | undefined;
};

export function useCodeParams(): CodeRouteParams {
  const codeRouteParams: CodeRouteParams = useParams();
  return codeRouteParams;
}
