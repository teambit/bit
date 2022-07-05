import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { gql } from '@apollo/client';

import { ScopeModel } from '@teambit/scope.models.scope-model';

const SCOPE = gql`
  {
    scope {
      name
      description
      icon
      backgroundIconColor
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
          newId
        }
        preview {
          includesEnvTemplate
        }
      }
    }
  }
`;

export function useScopeQuery(): { scope?: ScopeModel; loading?: boolean } {
  const { data, loading } = useDataQuery(SCOPE);

  if (!data || loading) {
    return { loading };
  }

  const scope = ScopeModel.from(data);

  return { scope, loading };
}
