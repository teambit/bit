import { useMemo, useEffect, useRef } from 'react';
import { gql } from '@apollo/client';
import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { ComponentID, ComponentIdObj } from '@teambit/component-id';
import { ComponentDescriptor, AspectList } from '@teambit/component-descriptor';

import { ComponentModel } from './component-model';
import { ComponentError } from './component-error';

const componentIdFields = gql`
  fragment componentIdFields on ComponentID {
    name
    version
    scope
  }
`;

const componentFields = gql`
  fragment componentFields on Component {
    id {
      ...componentIdFields
    }
    aspects(include: ["teambit.preview/preview"]) {
      id
      data
    }
    packageName
    elementsUrl
    description
    labels
    displayName
    latest
    server {
      env
      url
    }
    buildStatus
    compositions {
      identifier
      displayName
    }
    tags {
      version
    }
    env {
      id
      icon
    }

    preview {
      includesEnvTemplate
    }
  }
  ${componentIdFields}
`;

const GET_COMPONENT = gql`
  query Component($id: String!, $extensionId: String!) {
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
  subscription OnComponentAdded {
    componentAdded {
      component {
        ...componentFields
      }
    }
  }
  ${componentFields}
`;

const SUB_COMPONENT_CHANGED = gql`
  subscription OnComponentChanged {
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

/** provides data to component ui page, making sure both variables and return value are safely typed and memoized */
export function useComponentQuery(componentId: string, host: string) {
  const idRef = useRef(componentId);
  idRef.current = componentId;
  const { data, error, loading, subscribeToMore } = useDataQuery(GET_COMPONENT, {
    variables: { id: componentId, extensionId: host },
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
      entries: rawComponent?.aspects?.map((aspect) => ({ aspectId: aspect.id, aspectData: aspect.data })),
    };
    const id = ComponentID.fromObject(rawComponent.id);
    return {
      componentDescriptor: rawComponent ? ComponentDescriptor.fromObject({ id: id.toString(), aspectList }) : undefined,
      component: rawComponent ? ComponentModel.from({ ...rawComponent, host }) : undefined,
      // eslint-disable-next-line
      error: error
        ? new ComponentError(500, error.message)
        : !rawComponent && !loading
        ? new ComponentError(404)
        : undefined,
    };
  }, [rawComponent, host, error]);
}
