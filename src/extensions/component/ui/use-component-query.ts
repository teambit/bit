import { useMemo } from 'react';
import { gql } from 'apollo-boost';

import { ComponentModel } from './component-model';
import { useDataQuery } from '../../ui/ui/data/use-data-query';
import { ComponentModelProps } from './component-model/component-model';

const GET_COMPONENT = gql`
  query Component($id: String!) {
    workspace {
      getComponent(id: $id) {
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

// this is not ideal. can we derive type from gql?
type ComponentQueryData = {
  workspace?: {
    getComponent?: ComponentModelProps;
  };
};

/** provides data to component ui page, making sure both variables and return value are safely typed and memoized */
export function useComponentQuery(componentId: string) {
  const { data } = useDataQuery<ComponentQueryData>(GET_COMPONENT, {
    variables: { id: componentId }
  });

  const rawComponent = data?.workspace?.getComponent;

  return useMemo(() => (rawComponent ? ComponentModel.from(rawComponent) : undefined), [rawComponent]);
}
