import type { Component } from '@teambit/component';
import { gql } from 'graphql-tag';

import type { PreviewMain } from './preview.main.runtime';

export function previewSchema(previewExtension: PreviewMain) {
  return {
    typeDefs: gql`
      type Preview {
        # url: String!
        """
        Check if the component supports scaling
        """
        isScaling: Boolean
        includesEnvTemplate: Boolean
        legacyHeader: Boolean
        """
        @deprecated use onlyOverview
        """
        skipIncludes: Boolean
        onlyOverview: Boolean
        useNameParam: Boolean
      }

      extend type Component {
        preview: Preview
      }
    `,
    resolvers: {
      Component: {
        preview: (component: Component) => {
          // return previewExtension.getPreview(component);
          return { component };
        },
      },
      Preview: {
        includesEnvTemplate: ({ component }) => {
          return previewExtension.isBundledWithEnv(component);
        },
        isScaling: ({ component }) => {
          return previewExtension.doesScaling(component);
        },
        legacyHeader: ({ component }) => {
          return previewExtension.isLegacyHeader(component);
        },
        onlyOverview: ({ component }) => {
          return previewExtension.getOnlyOverview(component);
        },
        useNameParam: ({ component }) => {
          return previewExtension.getUseNameParam(component);
        },
        skipIncludes: ({ component }) => {
          return previewExtension.isSupportSkipIncludes(component);
        },
      },
    },
  };
}
