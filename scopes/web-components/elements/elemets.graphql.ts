import { Component } from '@teambit/component';
import { Schema } from '@teambit/graphql';
import gql from 'graphql-tag';

import { ElementsMain } from './elements.main.runtime';

export function elementsSchema(elements: ElementsMain): Schema {
  return {
    typeDefs: gql`
      extend type Component {
        # element url of the component.
        elementsUrl: String
      }
    `,
    resolvers: {
      Component: {
        elementsUrl: (component: Component) => {
          return elements.getElementUrl(component);
        },
      },
    },
  };
}
