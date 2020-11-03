import gql from 'graphql-tag';
import { Component } from '@teambit/component';
import { DocsMain } from './docs.main.runtime';

export function docsSchema(docs: DocsMain) {
  return {
    typeDefs: gql`
      extend type Component {
        description: String
      }
    `,
    resolvers: {
      Component: {
        description: (component: Component) => {
          return docs.getDescription(component);
        },
      },
    },
  };
}
