import { useQuery, gql } from '@apollo/client';
import { ComponentID } from '@teambit/component';

export const docsFields = gql`
  fragment docsFields on ReactDocs {
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
`;

const getProperties = gql`
  query($id: String!) {
    getHost {
      id # used for GQL caching
      getDocs(id: $id) {
        ...docsFields
      }
    }
  }
  ${docsFields}
`;

type PropertiesResult = {
  getHost: {
    id: string;
    getDocs: {
      abstract?: string;
      filePath?: string;
      properties?: Properties[];
    };
  };
};

export type Properties = {
  name: string;
  description: string;
  required: boolean;
  type: string;
  defaultValue?: DefaultValue;
};

export type DefaultValue = {
  value?: string;
  computed?: string;
};

export function useDocs(componentId: ComponentID) {
  const id = componentId._legacy.name;

  const { data } = useQuery<PropertiesResult>(getProperties, {
    variables: { id },
  });

  const properties = data?.getHost?.getDocs?.properties;

  return properties;
}
