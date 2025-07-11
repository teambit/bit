import { useEffect, useMemo } from 'react';
import { ComponentModel } from '@teambit/component';
import useLatest from '@react-hook/latest';
import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { gql } from '@apollo/client';
import { ComponentID, ComponentIdObj } from '@teambit/component-id';

import { Workspace } from './workspace-model';

type UseWorkspaceOptions = {
  onComponentAdded?: (component: ComponentModel[]) => void;
  onComponentUpdated?: (component: ComponentModel[]) => void;
  onComponentRemoved?: (compId: ComponentID[]) => void;
};
type RawComponent = { id: ComponentIdObj };

const wcComponentFields = gql`
  fragment wcComponentFields on Component {
    id {
      name
      version
      scope
    }
    aspects(include: ["teambit.preview/preview", "teambit.envs/envs"]) {
      # 'id' property in gql refers to a *global* identifier and used for caching.
      # this makes aspect data cache under the same key, even when they are under different components.
      # renaming the property fixes that.
      aspectId: id
      data
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
    buildStatus
    preview {
      includesEnvTemplate
      legacyHeader
      isScaling
      skipIncludes
    }
    deprecation {
      isDeprecate
      newId
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

const COMPONENT_SERVER_STARTED = gql`
  subscription OnComponentServerStarted {
    componentServerStarted {
      env
      url
      host
      basePath
    }
  }
`;

export function useWorkspace(options: UseWorkspaceOptions = {}) {
  const { data, subscribeToMore, ...rest } = useDataQuery(WORKSPACE);
  const optionsRef = useLatest(options);

  useEffect(() => {
    const unSubCompAddition = subscribeToMore({
      document: COMPONENT_SUBSCRIPTION_ADDED,
      updateQuery: (prev, { subscriptionData }) => {
        const update = subscriptionData.data;
        const addedComponent = update?.componentAdded?.component;
        if (!addedComponent) return prev;

        const componentExists = prev.workspace.components.find((component: any) =>
          ComponentID.isEqualObj(component.id, addedComponent.id, { ignoreVersion: true })
        );
        if (componentExists) return prev;

        // side effect - trigger observers
        setTimeout(() => optionsRef.current.onComponentAdded?.([ComponentModel.from(addedComponent)]));

        return {
          ...prev,
          workspace: {
            ...prev.workspace,
            components: [...prev.workspace.components, addedComponent],
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
        // side effect - trigger observers
        setTimeout(() => optionsRef.current.onComponentUpdated?.([ComponentModel.from(updatedComponent)]));

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
        const idsToRemove: ComponentIdObj[] | undefined = subscriptionData?.data?.componentRemoved?.componentIds;
        if (!idsToRemove || idsToRemove.length === 0) return prev;

        // side effect - trigger observers
        setTimeout(() => optionsRef.current.onComponentRemoved?.(idsToRemove.map((id) => ComponentID.fromObject(id))));

        return {
          ...prev,
          workspace: {
            ...prev.workspace,
            components: prev.workspace.components.filter((component: RawComponent) =>
              idsToRemove.every((id) => !ComponentID.isEqualObj(id, component.id))
            ),
          },
        };
      },
    });

    const unSubServerStarted = subscribeToMore({
      document: COMPONENT_SERVER_STARTED,
      updateQuery: (prev, { subscriptionData }) => {
        const update = subscriptionData.data;
        if (!update) return prev;

        const serverInfo = update.componentServerStarted;
        if (!serverInfo || serverInfo.length === 0) return prev;

        const updatedComponents = prev.workspace.components.map((component) => {
          if (component.env?.id === serverInfo[0].env) {
            return {
              ...component,
              server: {
                env: serverInfo[0].env,
                url: serverInfo[0].url,
                host: serverInfo[0].host,
                basePath: serverInfo[0].basePath,
              },
            };
          }
          return component;
        });

        return {
          ...prev,
          workspace: {
            ...prev.workspace,
            components: updatedComponents,
          },
        };
      },
    });

    return () => {
      unSubCompAddition();
      unSubCompChange();
      unSubCompRemoved();
      unSubServerStarted();
    };
  }, [optionsRef]);

  const workspace = useMemo(() => {
    return data?.workspace ? Workspace.from(data?.workspace) : undefined;
  }, [data?.workspace]);

  return {
    workspace,
    subscribeToMore,
    ...rest,
  };
}
