import gql from 'graphql-tag';
import { Component } from '@teambit/component';
import { PreviewExtension } from './preview.extension';

export function previewSchema(previewExtension: PreviewExtension) {
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
