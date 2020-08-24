import { Component } from '@teambit/component';
import gql from 'graphql-tag';

import { PreviewMain } from './preview.main.runtime';

export function previewSchema(previewExtension: PreviewMain) {
  return {
    typeDefs: gql`
      type Preview {
        url: String!
      }

      extend type Component {
        preview: Preview
      }
    `,
    resolvers: {
      Component: {
        preview: (component: Component) => {
          return previewExtension.getPreview(component);
        },
      },
    },
  };
}
