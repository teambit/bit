import React from 'react';
import { useQuery } from '@apollo/react-hooks';
import { gql } from 'apollo-boost';
import { useParams } from 'react-router-dom';
import { ComponentProvider } from './context';
import { TopBar } from './top-bar';
import styles from './component.module.scss';
import { TopBarSlotRegistry } from '../component.ui';

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
  topBarSlot: TopBarSlotRegistry;
};

export function Component({ topBarSlot }: ComponentProps) {
  const { slug } = useParams();
  // const { loading, error, data } = useQuery(GET_COMPONENT, {
  //   variables: {id: slug}
  // });

  return (
    <TopBar className={styles.topbar} sectionSlot={topBarSlot} currentTag={currentTag} />
    // <ComponentProvider>

    // </ComponentProvider>
  );
}
