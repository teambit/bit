import { Component } from '@teambit/component';
import { Schema } from '@teambit/graphql';
import gql from 'graphql-tag';

import { DependencyResolverMain } from './dependency-resolver.main.runtime';
import { Dependency } from './dependencies';

enum DependencyTypes {
  component = 'ComponentDependency',
  package = 'PackageDependency',
}

export function dependencyResolverSchema(dependencyResolver: DependencyResolverMain): Schema {
  return {
    typeDefs: gql`
      interface Dependency {
        id: String!
        version: String!
        lifecycle: String!
        type: String!
      }
      # union Dependency = PackageDependency | ComponentDependency

      type ComponentIdObject {
        scope: String!
        name: String!
        version: String!
      }

      type PackageDependency implements Dependency {
        id: String!
        version: String!
        lifecycle: String!
        type: String!
      }

      type ComponentDependency implements Dependency {
        id: String!
        version: String!
        lifecycle: String!
        isExtension: Boolean!
        packageName: String!
        type: String!
      }

      extend type Component {
        dependencies: [Dependency]
      }
    `,
    resolvers: {
      Component: {
        dependencies: async (component: Component) => {
          const dependenciesList = await dependencyResolver.getDependencies(component);
          const serialized = dependenciesList.serialize();
          return serialized.map((serialize) => {
            const type = DependencyTypes[serialize.__type];
            // @ts-ignore
            serialize.type = serialize.__type;
            // @ts-ignore
            delete serialize.__type;
            return {
              __typename: type,
              ...serialize,
            };
          });
        },
        Dependency: {
          __resolveType: (dependency: Dependency) => {
            return DependencyTypes[dependency.type];
          },
        },
      },
    },
  };
}
