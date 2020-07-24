import gql from 'graphql-tag';
import { Component } from '../component';
import { PreviewExtension } from './preview.extension';

export function previewSchema(previewExtension: PreviewExtension) {
  return {
    typeDefs: gql`
      extend type Component {
        preview: String
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
