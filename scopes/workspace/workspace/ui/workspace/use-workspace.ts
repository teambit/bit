import { useEffect, useMemo } from 'react';
import { useDataQuery } from '@teambit/ui';
import gql from 'graphql-tag';

import { Workspace } from './workspace-model';

const wcComponent = gql`
  fragment wcComponent on Component {
    id {
      name
      version
      scope
    }
    compositions {
      identifier
    }
    issuesCount
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
`;

const WORKSPACE = gql`
  query workspace {
    workspace {
      name
      path
      icon
      components {
        ...wcComponent
      }
    }
  }
  ${wcComponent}
`;

const COMPONENT_SUBSCRIPTION_ADDED = gql`
  subscription OnComponentAdded {
    componentAdded {
      component {
        ...wcComponent
      }
    }
  }
  ${wcComponent}
`;

const COMPONENT_SUBSCRIPTION_CHANGED = gql`
  subscription OnComponentChanged {
    componentChanged {
      component {
        ...wcComponent
      }
    }
  }
  ${wcComponent}
`;

export function useWorkspace() {
  const { data, subscribeToMore } = useDataQuery(WORKSPACE);

  useEffect(() => {
    const unSubCompAddition = subscribeToMore({
      document: COMPONENT_SUBSCRIPTION_ADDED,
      updateQuery: (prev, { subscriptionData }) => {
        const update = subscriptionData.data;
        if (!update) return prev;

        return {
          ...prev,
          workspace: {
            ...prev.workspace,
            components: [...prev.workspace.components, update.componentAdded.component],
          },
        };
      },
    });

    const unSubCompChange = subscribeToMore({
      document: COMPONENT_SUBSCRIPTION_CHANGED,
      updateQuery: (prev, { subscriptionData }) => {
        const update = subscriptionData.data;
        if (!update) return prev;

        const updatedComponent = update.componentChanged.component;
        update.componentChanged.component;

        return {
          ...prev,
          workspace: {
            ...prev.workspace,
            components: prev.workspace.components.map((component) =>
              component.id.name === updatedComponent.id.name ? updatedComponent : component
            ),
          },
        };
      },
    });

    // TODO - sub to component removal

    return () => {
      unSubCompAddition();
      unSubCompChange();
    };
  }, []);

  const workspace = data?.workspace;

  return useMemo(() => {
    return workspace ? Workspace.from(workspace) : undefined;
  }, [workspace]);
}
