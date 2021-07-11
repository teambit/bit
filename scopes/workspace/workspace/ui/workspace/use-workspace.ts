import { useEffect, useMemo } from 'react';
import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { gql } from '@apollo/client';
import { ComponentID } from '@teambit/component-id';

import { Workspace } from './workspace-model';

type RawComponent = { id: object };

const wcComponentFields = gql`
  fragment wcComponentFields on Component {
    id {
      name
      version
      scope
    }
    compositions {
      identifier
    }
    description
    issuesCount
    status {
      isOutdated
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
        ...wcComponentFields
      }
    }
  }
  ${wcComponentFields}
`;

const COMPONENT_SUBSCRIPTION_ADDED = gql`
  subscription OnComponentAdded {
    componentAdded {
      component {
        ...wcComponentFields
      }
    }
  }
  ${wcComponentFields}
`;

const COMPONENT_SUBSCRIPTION_CHANGED = gql`
  subscription OnComponentChanged {
    componentChanged {
      component {
        ...wcComponentFields
      }
    }
  }
  ${wcComponentFields}
`;

const COMPONENT_SUBSCRIPTION_REMOVED = gql`
  subscription OnComponentRemoved {
    componentRemoved {
      componentIds {
        name
        version
        scope
      }
    }
  }
`;

export function useWorkspace() {
  const { data, subscribeToMore } = useDataQuery(WORKSPACE);

  useEffect(() => {
    const unSubCompAddition = subscribeToMore({
      document: COMPONENT_SUBSCRIPTION_ADDED,
      updateQuery: (prev, { subscriptionData }) => {
        const update = subscriptionData.data;
        if (!update) return prev;
        const componentExists = prev.workspace.components.find(
          (component: any) =>
            ComponentID.fromObject(component.id, component.id.scope).toString() ===
            ComponentID.fromObject(
              update.componentAdded.component.id,
              update.componentAdded.component.id.scope
            ).toString()
        );
        if (componentExists) return prev;

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

    const unSubCompRemoved = subscribeToMore({
      document: COMPONENT_SUBSCRIPTION_REMOVED,
      updateQuery: (prev, { subscriptionData }) => {
        const componentIds: object[] | undefined = subscriptionData.data?.componentRemoved?.componentIds;
        const idsToRemove = componentIds?.map((x) => ComponentID.fromObject(x));
        if (!idsToRemove || idsToRemove.length === 0) return prev;

        return {
          ...prev,
          workspace: {
            ...prev.workspace,
            components: prev.workspace.components.filter((component: RawComponent) => {
              const compId = ComponentID.fromObject(component.id);
              return idsToRemove.every((id) => !id.isEqual(compId));
            }),
          },
        };
      },
    });

    // TODO - sub to component removal

    return () => {
      unSubCompAddition();
      unSubCompChange();
      unSubCompRemoved();
    };
  }, []);

  const workspace = data?.workspace;

  return useMemo(() => {
    return workspace ? Workspace.from(workspace) : undefined;
  }, [workspace]);
}
