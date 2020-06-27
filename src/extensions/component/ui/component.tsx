import React from 'react';
import { useQuery } from '@apollo/react-hooks';
import { gql } from 'apollo-boost';
import { Switch, useRouteMatch } from 'react-router-dom';
import { ComponentProvider } from './context';
import { TopBar } from './top-bar';
import styles from './component.module.scss';
import { SectionSlotRegistry } from '../component.ui';
import { ComponentModel } from './component-model';

const GET_COMPONENT = gql`
  query Component($id: String!) {
    workspace {
      getComponent(id: $id) {
        id
        server {
          env
          url
        }
      }
    }
  }
`;

// TEMP!
const currentTag = {
  version: '5.0.10',
  downloads: 542,
  likes: 86
};

export type ComponentProps = {
  sectionSlot: SectionSlotRegistry;
};

/**
 * main UI component of the Component extension.
 */
export function Component({ sectionSlot }: ComponentProps) {
  const { url } = useRouteMatch();
  const componentId = parseComponentId(url);
  const { loading, error, data } = useQuery(GET_COMPONENT, {
    variables: { id: componentId }
  });

  // :TODO @uri please add a proper loader with amir
  if (loading) return <div>loading</div>;
  if (error) throw error;

  const component = ComponentModel.from(data.workspace.getComponent);

  return (
    <ComponentProvider component={component}>
      <TopBar className={styles.topbar} sectionSlot={sectionSlot} currentTag={currentTag} />
      <Switch>{sectionSlot.values().map(section => section.route)}</Switch>
    </ComponentProvider>
  );
}

// :TODO @uri we need to find a better solution for this through the react-router api.
function parseComponentId(url: string) {
  const componentId = url.split('/~')[0];
  return componentId.substr(1, componentId.length - 1);
}
