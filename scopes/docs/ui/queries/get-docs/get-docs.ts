import { useQuery } from '@apollo/react-hooks';
import { gql } from 'apollo-boost';
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

const GET_PROPERTIES = gql`
  query($id: String!) {
    getHost {
      getDocs(id: $id) {
        ...docsFields
      }
    }
  }
  ${docsFields}
`;

type PropertiesResult = {
  getHost: {
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

  const { data } = useQuery<PropertiesResult>(GET_PROPERTIES, {
    variables: { id },
  });

  const properties = data?.getHost?.getDocs?.properties;

  return properties;
}
