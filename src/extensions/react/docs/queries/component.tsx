import { gql } from 'apollo-boost';

export const GET_COMPONENT = gql`
  query Component($id: String!) {
    workspace {
      getComponent(id: $id) {
        id
        displayName
      }
    }
  }
`;
