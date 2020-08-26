import { useSubscription } from '@apollo/react-hooks';
import { useDataQuery } from '@teambit/ui';
import gql from 'graphql-tag';

import { Workspace } from './workspace-model';

const WORKSPACE = gql`
  {
    workspace {
      name
      path
      icon
      components {
        id {
          name
          version
          scope
        }
        status {
          isNew
          isInScope
          isStaged
          modifyInfo {
            hasModifiedFiles
            hasModifiedDependencies
          }
          isDeleted
        }
        deprecation {
          isDeprecate
        }
        server {
          env
          url
        }
        env {
          id
          icon
        }
      }
    }
  }
`;

const COMPONENT_SUBSCRIPTION = gql`
  subscription OnComponentAdded {
    componentAdded
  }
`;

export function useWorkspace() {
  const { data } = useDataQuery(WORKSPACE);
  const sub = useSubscription(COMPONENT_SUBSCRIPTION);

  if (sub.data && data) {
    data.workspace.components.concat(sub.data.componentAdded);
  }
  if (data) return Workspace.from(data.workspace);
  return undefined;
}
