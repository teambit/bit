import { Schema } from '@teambit/graphql';
import gql from 'graphql-tag';
import { GeneratorMain } from './generator.main.runtime';
import { CreateOptions } from './create.cmd';

export type CreateQueryOptions = CreateOptions & { templateName: string };

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
        createComponent(
          name: String!
          templateName: String!
          scope: String
          namespace: String
          aspect: String
        ): [GenerateResult]
      }

      type TemplateDescriptor {
        aspectId: String!
        name: String!
      }

      type Generator {
        templates: [TemplateDescriptor]
      }

      type Query {
        generator: Generator
      }
    `,
    resolvers: {
      Mutation: {
        createComponent: async (req: any, { name, templateName, ...options }: CreateQueryOptions) => {
          const res = await generator.generateComponentTemplate([name], templateName, { name, ...options });
          return res.map((component) => ({
            id: component.id.toString(),
            dir: component.dir,
            files: component.files,
          }));
        },
      },
      Generator: {
        templates: async () => {
          return generator.listTemplates();
        },
      },
      Query: {
        generator: () => generator,
      },
    },
  };
}
