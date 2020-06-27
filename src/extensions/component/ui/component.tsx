import React from 'react';
import { useQuery } from '@apollo/react-hooks';
import { gql } from 'apollo-boost';
import { useParams, Switch } from 'react-router-dom';
import { ComponentProvider } from './context';
import { TopBar } from './top-bar';
import styles from './component.module.scss';
import { SectionSlotRegistry } from '../component.ui';

const GET_COMPONENT = gql`
  query Component($id: String!) {
    component(id: $id) {
      id
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

export function Component({ sectionSlot }: ComponentProps) {
  const { slug } = useParams();
  // const { loading, error, data } = useQuery(GET_COMPONENT, {
  //   variables: {id: slug}
  // });
  return (
    <div>
      <TopBar className={styles.topbar} sectionSlot={sectionSlot} currentTag={currentTag} />
      <Switch>{sectionSlot.values().map(section => section.route)}</Switch>
    </div>
  );
}
