import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { gql } from '@apollo/client';

import { ScopeModel } from '@teambit/scope.models.scope-model';

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
        buildStatus
        deprecation {
          isDeprecate
        }
      }
    }
  }
`;

export function useScopeQuery(): { scope?: ScopeModel } {
  const { data, loading } = useDataQuery(SCOPE);

  if (!data || loading) {
    return {};
  }

  const scope = ScopeModel.from(data);

  return { scope };
}
