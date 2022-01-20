import { Component } from '@teambit/component';
import { Schema } from '@teambit/graphql';
import gql from 'graphql-tag';

import { ComponentSizerMain } from './component-sizer.main.runtime';

export function componentSizerSchema(componentSizerMain: ComponentSizerMain): Schema {
  return {
    typeDefs: gql`
      extend type Component {
        # size of the component bundle
        size: Int
      }
    `,
    resolvers: {
      Component: {
        size: (component: Component) => {
          return componentSizerMain.getComponentSize(component);
        }
      },
    },
  };
}
