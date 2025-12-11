import type { Component } from '@teambit/component';
import type { Schema } from '@teambit/graphql';
import { gql } from 'graphql-tag';
import type { RenamingMain } from './renaming.main.runtime';

export function renamingSchema(renaming: RenamingMain): Schema {
  return {
    typeDefs: gql`
      extend type Component {
        renaming: RenamingInfo
      }

      type RenamingInfo {
        renamedFrom: String
      }
    `,
    resolvers: {
      Component: {
        renaming: (component: Component) => {
          const renamingInfo = renaming.getRenamingInfo(component);
          return {
            renamedFrom: renamingInfo?.renamedFrom.toString(),
          };
        },
      },
    },
  };
}
