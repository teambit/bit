import { useDataQuery } from '@teambit/ui';
import gql from 'graphql-tag';

import { ScopeModel } from './scope-model';

const SCOPE = gql`
  {
    scope {
      name
      description
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
