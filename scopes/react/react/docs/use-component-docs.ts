// import { useQuery, gql } from '@apollo/client';
// import { docsFields } from '@teambit/ui.queries.get-docs';

// const GET_COMPONENT = gql`
//   query($id: String!) {
//     getHost {
//       id # used for GQL caching
//       get(id: $id) {
//         id {
//           name
//           version
//           scope
//         }
//         displayName
//         packageName
//         description
//         labels
//         compositions {
//           identifier
//         }
//       }
//       getDocs(id: $id) {
//         ...docsFields
//       }
//     }
//   }
//   ${docsFields}
// `;

// export function useComponentDocs(componentId: string) {
//   const results = useQuery(GET_COMPONENT, {
//     variables: { id: componentId },
//   });

//   return results;
// }
