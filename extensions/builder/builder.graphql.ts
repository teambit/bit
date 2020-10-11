import { Component } from '@teambit/component';
import gql from 'graphql-tag';

import { BuilderMain } from './builder.main.runtime';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function builderSchema(builder: BuilderMain) {
  return {
    typeDefs: gql`
      type ExtensionDescriptor {
        # extension ID.
        id: String

        # icon of the extension.
        icon: String
      }

      type ExtensionArtifact {
        # descriptor of the artifact's extension
        extensionDescriptor: ExtensionDescriptor
      }

      extend type Component {
        # list of extension artifacts.
        getArtifacts(hash: String!): [ExtensionArtifact]
      }
    `,
    resolvers: {
      Component: {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        getArtifacts: async (component: Component, { hash }: { hash: string }) => {
          // const artifacts = await builder.getArtifacts(component.id, hash);
          // return artifacts.map((artifact) => artifact.toObject());
        },
      },
    },
  };
}
