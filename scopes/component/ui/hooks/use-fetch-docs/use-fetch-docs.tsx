import { useMemo } from 'react';
import { useQuery, gql } from '@teambit/graphql.hooks.use-query-light';

const GQL_SERVER = '/graphql';
const DOCS_QUERY = gql`
  query getComponentDocs($id: String!) {
    getHost {
      id # for gql caching
      getDocs(id: $id) {
        abstract
        properties {
          name
          description
          required
          type
          default: defaultValue {
            value
          }
        }
      }
    }
  }
`;

type QueryResults = {
  getHost: {
    id: string;
    getDocs: DocsItem;
  };
};

type Property = {
  name: string;
  description: string;
  required: boolean;
  type: string;
  default: {
    value: string;
  };
};

type DocsItem = {
  abstract: string;
  properties: Property[];
};

export function useFetchDocs(componentId: string) {
  const variables = { id: componentId };
  const request = useQuery<QueryResults>(DOCS_QUERY, { variables, server: GQL_SERVER });

  const result = useMemo(() => {
    return { ...request, data: request.data && { docs: request.data?.getHost.getDocs } };
  }, [request]);

  return result;
}
