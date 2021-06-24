import { useEffect, useState } from 'react';
import { request, gql } from 'graphql-request';
import { ComponentModel } from '@teambit/component';

const GQL_SERVER = '/graphql';
const DOCS_QUERY = gql`
  query getComponentDocs($id: String!) {
    getHost {
      id
      get(id: $id) {
        id {
          name
          version
          scope
        }
        displayName
        packageName
        description
        labels
        compositions {
          identifier
        }
      }
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
    get: {
      id: {
        name: string;
        version: string;
        scope: string;
      };
      displayName: string;
      packageName: string;
      description: string;
      labels: string[];
      compositions: {
        identifier: string;
      }[];
    };
    getDocs: DocsItem;
  };
};

type DocsItem = {
  abstract: string;
  properties: {
    name: string;
    description: string;
    required: boolean;
    type: string;
    default: {
      value: string;
    };
  };
};

type FetchDocsObj =
  | {
      component: ComponentModel;
      docs: DocsItem;
    }
  | undefined;

export function useFetchDocs(componentId: string) {
  const [data, setData] = useState<FetchDocsObj>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(undefined);

  useEffect(() => {
    setLoading(true);

    const variables = { id: componentId };
    request(GQL_SERVER, DOCS_QUERY, variables)
      .then((result: QueryResults) => {
        setData({
          component: ComponentModel.from(result.getHost.get),
          docs: result.getHost.getDocs,
        });
        setLoading(false);
      })
      .catch((e) => {
        setError(e);
        setLoading(false);
      });
  }, [componentId]);

  return { data, loading, error };
}
