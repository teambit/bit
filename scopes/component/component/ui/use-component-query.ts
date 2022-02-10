import { DocumentNode } from 'graphql';
import { merge } from 'lodash';
import { graphql } from '@apollo/client/react/hoc';
import { useMemo, useEffect, useRef } from 'react';
import { mergeTypeDefs } from '@graphql-tools/merge';
import { gql } from '@apollo/client';
import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { ComponentID, ComponentIdObj } from '@teambit/component-id';
import { ComponentDescriptorProps, ComponentDescriptor } from '@teambit/component-descriptor';

import { ComponentModel } from './component-model';
import { ComponentError } from './component-error';
import flatten from 'lodash.flatten';

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
    aspects {
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

    size {
      compressedTotal
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

function uniteGql(sizeFields) {
  const a = !sizeFields || sizeFields.length === 0 ? {} : sizeFields;
  const b = Array.isArray(a) ? flatten(a) : a;
  // const cd = gql`
  // fragment c on Component {
  // }`;
  const c = merge(b, componentFields);
  // const d = c instanceof DocumentNode ? c : ''
  console.log('vcc', c);
  const size = sizeFields?.[0]?.loc?.source?.body;
  console.log('size', sizeFields, size, merge(b, componentFields));
  // debugger
  const GET_COMPONENT = gql`
    query Component($id: String!, $extensionId: String!) {
      getHost(id: $extensionId) {
        id # used for GQL caching
        get(id: $id) {
          ...c
        }
      }
    }
    ${c}
  `;

  return GET_COMPONENT;
}

// function

/** provides data to component ui page, making sure both variables and return value are safely typed and memoized */
export function useComponentQuery(componentId: string, host: string, _componentFields?: DocumentNode[]) {
  const idRef = useRef(componentId);
  idRef.current = componentId;
  // const bla = mergeTypeDefs([GET_COMPONENT, _componentFields || []])
  // const bla2 = uniteGql(_componentFields || [])

  // console.log("bla2", bla2)
  console.log('_componentFields props', _componentFields);
  console.log('componentFields', componentFields);
  const unite = uniteGql(_componentFields);
  console.log('unite', unite, GET_COMPONENT);
  // debugger
  const { data, error, loading, subscribeToMore } = useDataQuery(unite, {
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
    return {
      componentDescriptor: rawComponent ? ComponentDescriptor.fromObject(rawComponent.id) : undefined,
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
