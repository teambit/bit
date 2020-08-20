import gql from 'graphql-tag';
import { ScopeModel } from './scope-model';
import { useDataQuery } from '@teambit/ui';

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
        env {
          id
          icon
        }
        deprecation {
          isDeprecate
        }
      }
    }
  }
`;

export function useScope(): { scope?: ScopeModel } {
  const { data, loading } = useDataQuery(SCOPE);

  if (!data || loading) {
    return {};
  }

  const scope = ScopeModel.from(data);

  return { scope };
}
