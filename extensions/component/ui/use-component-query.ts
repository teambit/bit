import { useMemo } from 'react';
import { gql } from 'apollo-boost';
import { ComponentModel } from './component-model';
import { useDataQuery } from '@teambit/ui/ui/data/use-data-query';

const GET_COMPONENT = gql`
  query Component($id: String!, $extensionId: String!) {
    getHost(id: $extensionId) {
      get(id: $id) {
        id {
          name
          version
          scope
        }
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
          snap {
            hash
            timestamp
            message
          }
        }
      }
    }
  }
`;

/** provides data to component ui page, making sure both variables and return value are safely typed and memoized */
export function useComponentQuery(componentId: string, host: string) {
  const { data } = useDataQuery(GET_COMPONENT, {
    variables: { id: componentId, extensionId: host },
  });

  const rawComponent = data?.getHost?.get;

  return useMemo(() => (rawComponent ? ComponentModel.from(rawComponent) : undefined), [rawComponent]);
}
