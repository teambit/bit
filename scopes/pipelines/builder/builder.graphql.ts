import { Component } from '@teambit/component';
import gql from 'graphql-tag';
import { Scope } from '@teambit/legacy/dist/scope';
import { ArtifactVinyl } from '@teambit/legacy/dist/consumer/component/sources/artifact';

import { BuilderMain } from './builder.main.runtime';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function builderSchema(builder: BuilderMain, scope: Scope) {
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
        getArtifacts(hash: String!): String
      }
    `,
    resolvers: {
      Component: {
        getArtifacts: async (component: Component, { hash }: { hash: string }) => {
          const artifacts = await builder.getArtifacts(component);
          const artifactVinyls = (artifacts || []).map((artifact) =>
            artifact.files.getVinylsAndImportIfMissing(component.id._legacy, scope)
          );

          (await Promise.all(artifactVinyls)).forEach((vinyls) => {
            for (const vinyl of vinyls) {
              console.log('🚀\n', vinyl.path);
              console.log(vinyl.contents.toString('utf-8'));
            }
          });
          return artifacts;
        },
      },
    },
  };
}
