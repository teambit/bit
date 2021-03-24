import { Schema } from '@teambit/graphql';
import gql from 'graphql-tag';

import { GeneratorMain } from './generator.main.runtime';

export function generatorSchema(generator: GeneratorMain): Schema {
  return {
    typeDefs: gql`
      type GenerateResult {
        id: String
        dir: String
        files: [String]
      }

      type Mutation {
        # create Component by template
        createComponent(name: String, templateName: string): [GenerateResult]
      }
    `,
    resolvers: {
      Mutation: {
        createComponent: async (req: any, { name, templateName }: { name: string; templateName: string }) => {
          const res = await generator.generateComponentTemplate([name], templateName, {});
          return res.map((component) => ({
            id: component.id.toString(),
            dir: component.dir,
            files: component.files,
          }));
        },
      },
    },
  };
}
