import { useMemo, useEffect } from 'react';
import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { gql } from '@apollo/client';

import { ComponentModel } from './component-model';
import { ComponentError } from './component-error';

const componentFields = gql`
  fragment componentFields on Component {
    id {
      name
      version
      scope
    }
    packageName
    displayName
    server {
      env
      url
    }
    compositions {
      identifier
    }
    tags {
      version
    }
    env {
      id
      icon
    }
  }
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

const SUB_COMPONENT = gql`
  subscription OnComponentChanged {
    componentChanged {
      component {
        ...componentFields
      }
    }
  }
  ${componentFields}
`;

/** provides data to component ui page, making sure both variables and return value are safely typed and memoized */
export function useComponentQuery(componentId: string, host: string) {
  const { data, error, loading, subscribeToMore } = useDataQuery(GET_COMPONENT, {
    variables: { id: componentId, extensionId: host },
  });

  useEffect(() => {
    // @TODO @Kutner fix subscription for scope
    if (host !== 'teambit.workspace/workspace') {
      return () => {};
    }

    const unsub = subscribeToMore({
      document: SUB_COMPONENT,
      updateQuery: (prev, { subscriptionData }) => {
        if (!subscriptionData.data) return prev;

        const updatedComponent = subscriptionData?.data?.componentChanged?.component;
        // TODO -  add `id` param to componentChanged subscription, and pre-filter on server side
        if (!updatedComponent || prev.getHost.get.id.name !== updatedComponent.id.name) return prev;

        return {
          ...prev,
          getHost: {
            ...prev.getHost,
            get: updatedComponent,
          },
        };
      },
    });

    return () => {
      unsub();
    };
  }, []);

  const rawComponent = data?.getHost?.get;

  return useMemo(() => {
    return {
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
