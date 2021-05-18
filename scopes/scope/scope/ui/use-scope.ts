import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { gql } from '@apollo/client';

import { ScopeModel } from './scope-model';

const SCOPE = gql`
  {
    scope {
      name
      description
      icon
      components {
        id {
          name
          version
          scope
        }
        description
        compositions {
          identifier
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
