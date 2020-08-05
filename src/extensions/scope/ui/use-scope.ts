import gql from 'graphql-tag';
import { ScopeModel } from './scope-model';
import { useDataQuery } from '../../ui/ui/data/use-data-query';

const SCOPE = gql`
  {
    scope {
      name
      components {
        id {
          name
          version
          scope
        }
      }
    }
  }
`;

export function useScope() {
  const { data, loading } = useDataQuery(SCOPE);

  if (loading) return { loading: true };
  const scope = ScopeModel.from(data);

  return {
    scope,
    loading,
  };
}
