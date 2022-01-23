import { Component } from '@teambit/component';
import { Schema } from '@teambit/graphql';
import gql from 'graphql-tag';

import { ComponentSizerMain } from './component-sizer.main.runtime';

export function componentSizerSchema(componentSizerMain: ComponentSizerMain): Schema {
  return {
    typeDefs: gql`
      type ComponentSizedFile {
        name: String
        size: Int
      }

      type ComponentSize {
        # breakdown for the component files sizes
        files: [ComponentSizedFile]
        # breakdown for the component assets sizes
        assets: [ComponentSizedFile]
        # total size of the component files (like js and css) (without assets)
        totalFiles: Int
        # total size of the component assets (like pngs) (without files)
        totalAssets: Int
        # total size of the component files and assets
        total: Int
      }

      extend type Component {
        # size of the component bundle
        size: ComponentSize
      }
    `,
    resolvers: {
      Component: {
        size: (component: Component) => {
          return componentSizerMain.getComponentSize(component);
        },
      },
    },
  };
}
