// import { Component } from '@teambit/component';
// import { Schema } from '@teambit/graphql';
// import { gql } from '@apollo/client';

// // import { ComponentMain } from './component.main.runtime';

// export function useChangeLogSchema(): Schema {
//   return {
//     typeDefs: gql`
//       extend type Component {
//         # get component logs(snaps)
//         logs(id: String!): [LogEntry]!
//       }

//       type LogEntry {
//         message: String!
//         username: String
//         email: String
//         date: String
//         hash: String!
//         tag: String
//         id: String!
//       }
//     `,
//     resolvers: {
//       Component: {
//         logs: async (host: ComponentFactory, { id }: { id: string }) => {
//             const componentId = await host.resolveComponentId(id);
//             return (await host.getLogs(componentId)).map(log => ({...log, id: log.hash}))
//           },
//       },
//     },
//   };
// }
