import { useMemo, useEffect, useRef } from 'react';
import { gql } from '@apollo/client';
import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { ComponentID, ComponentIdObj } from '@teambit/component-id';
import { ComponentDescriptor } from '@teambit/component-descriptor';

import { ComponentModel } from './component-model';
import { ComponentError } from './component-error';

export const componentIdFields = gql`
  fragment componentIdFields on ComponentID {
    name
    version
    scope
  }
`;

export const componentOverviewFields = gql`
  fragment componentOverviewFields on Component {
    id {
      ...componentIdFields
    }
    aspects(include: ["teambit.preview/preview", "teambit.envs/envs"]) {
      # 'id' property in gql refers to a *global* identifier and used for caching.
      # this makes aspect data cache under the same key, even when they are under different components.
      # renaming the property fixes that.
      id
      data
    }
    elementsUrl
    description
    deprecation {
      isDeprecate
    }
    labels
    displayName
    server {
      env
      url
    }
    buildStatus
    env {
      id
      icon
    }
    size {
      compressedTotal
    }
    preview {
      includesEnvTemplate
      legacyHeader
    }
    compositions {
      identifier
      displayName
    }
  }
  ${componentIdFields}
`;

export const componentFields = gql`
  fragment componentFields on Component {
    id {
      ...componentIdFields
    }
    ...componentOverviewFields
    packageName
    latest
    compositions {
      identifier
      displayName
    }
    tags {
      version
    }
    logs(type: $logType, offset: $logOffset, limit: $logLimit, head: $logHead, sort: $logSort) {
      id
      message
      username
      email
      date
      hash
      tag
    }
  }
  ${componentIdFields}
  ${componentOverviewFields}
`;

const GET_COMPONENT = gql`
  query Component(
    $id: String!
    $extensionId: String!
    $logType: String
    $logOffset: Int
    $logLimit: Int
    $logHead: String
    $logSort: String
  ) {
    getHost(id: $extensionId) {
      id # used for GQL caching
      get(id: $id) {
        ...componentFields
      }
    }
  }
  ${componentFields}
`;

const SUB_SUBSCRIPTION_ADDED = gql`
  subscription OnComponentAdded($logType: String, $logOffset: Int, $logLimit: Int, $logHead: String, $logSort: String) {
    componentAdded {
      component {
        ...componentFields
      }
    }
  }
  ${componentFields}
`;

const SUB_COMPONENT_CHANGED = gql`
  subscription OnComponentChanged(
    $logType: String
    $logOffset: Int
    $logLimit: Int
    $logHead: String
    $logSort: String
  ) {
    componentChanged {
      component {
        ...componentFields
      }
    }
  }
  ${componentFields}
`;

const SUB_COMPONENT_REMOVED = gql`
  subscription OnComponentRemoved {
    componentRemoved {
      componentIds {
        ...componentIdFields
      }
    }
  }
  ${componentIdFields}
`;
export type Filters = {
  log?: { logType?: string; logOffset?: number; logLimit?: number; logHead?: string; logSort?: string };
};
/** provides data to component ui page, making sure both variables and return value are safely typed and memoized */
export function useComponentQuery(componentId: string, host: string, filters?: Filters) {
  const idRef = useRef(componentId);
  idRef.current = componentId;
  const { data, error, loading, subscribeToMore, ...rest } = useDataQuery(GET_COMPONENT, {
    variables: { id: componentId, extensionId: host, ...(filters?.log || {}) },
  });

  useEffect(() => {
    // @TODO @Kutner fix subscription for scope
    if (host !== 'teambit.workspace/workspace') {
      return () => {};
    }

    const unsubAddition = subscribeToMore({
      document: SUB_SUBSCRIPTION_ADDED,
      updateQuery: (prev, { subscriptionData }) => {
        const prevComponent = prev?.getHost?.get;
        const addedComponent = subscriptionData?.data?.componentAdded?.component;

        if (!addedComponent || prevComponent) return prev;

        if (idRef.current === addedComponent.id.name) {
          return {
            ...prev,
            getHost: {
              ...prev.getHost,
              get: addedComponent,
            },
          };
        }

        return prev;
      },
    });

    const unsubChanges = subscribeToMore({
      document: SUB_COMPONENT_CHANGED,
      updateQuery: (prev, { subscriptionData }) => {
        if (!subscriptionData.data) return prev;

        const prevComponent = prev?.getHost?.get;
        const updatedComponent = subscriptionData?.data?.componentChanged?.component;

        const isUpdated = updatedComponent && ComponentID.isEqualObj(prevComponent?.id, updatedComponent?.id);

        if (isUpdated) {
          return {
            ...prev,
            getHost: {
              ...prev.getHost,
              get: updatedComponent,
            },
          };
        }

        return prev;
      },
    });

    const unsubRemoval = subscribeToMore({
      document: SUB_COMPONENT_REMOVED,
      updateQuery: (prev, { subscriptionData }) => {
        if (!subscriptionData.data) return prev;

        const prevComponent = prev?.getHost?.get;
        const removedIds: ComponentIdObj[] | undefined = subscriptionData?.data?.componentRemoved?.componentIds;
        if (!prevComponent || !removedIds?.length) return prev;

        const isRemoved = removedIds.some((removedId) => ComponentID.isEqualObj(removedId, prevComponent.id));

        if (isRemoved) {
          return {
            ...prev,
            getHost: {
              ...prev.getHost,
              get: null,
            },
          };
        }

        return prev;
      },
    });

    return () => {
      unsubChanges();
      unsubAddition();
      unsubRemoval();
    };
  }, []);

  const rawComponent = data?.getHost?.get;
  return useMemo(() => {
    const aspectList = {
      entries: rawComponent?.aspects.map((aspectObject) => {
        return {
          ...aspectObject,
          aspectId: aspectObject.id,
          aspectData: aspectObject.data
        };
      }),
    };
    const id = rawComponent && ComponentID.fromObject(rawComponent.id);
    return {
      componentDescriptor: id ? ComponentDescriptor.fromObject({ id: id.toString(), aspectList }) : undefined,
      component: rawComponent ? ComponentModel.from({ ...rawComponent, host }) : undefined,
      // eslint-disable-next-line
      error: error
        ? new ComponentError(500, error.message)
        : !rawComponent && !loading
        ? new ComponentError(404)
        : undefined,
      loading,
      ...rest,
    };
  }, [rawComponent, host, error]);
}
