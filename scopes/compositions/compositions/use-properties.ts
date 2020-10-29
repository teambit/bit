import { useQuery } from '@apollo/react-hooks';
import { gql } from 'apollo-boost';
import { ComponentID } from '@teambit/component';

const GET_PROPERTIES = gql`
  query($id: String!) {
    getHost {
      getDocs(id: $id) {
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

type PropertiesResult = {
  getHost: {
    getDocs: {
      properties?: any; // TODO
    };
  };
};

export function useProperties(componentId: ComponentID) {
  const id = componentId._legacy.name;

  const { data } = useQuery<PropertiesResult>(GET_PROPERTIES, {
    variables: { id },
  });

  const properties = data?.getHost?.getDocs?.properties;

  return properties;
}
