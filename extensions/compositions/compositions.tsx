import { useQuery } from '@apollo/react-hooks';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { SplitPane, Pane, Layout } from '@teambit/base-ui.surfaces.split-pane.split-pane';
import { HoverSplitter } from '@teambit/base-ui.surfaces.split-pane.hover-splitter';
import { ComponentContext, ComponentModel } from '@teambit/component';
import { PropTable } from '@teambit/documenter.ui.property-table';
import { Tab, TabContainer, TabList, TabPanel } from '@teambit/panels';
import { Collapser } from '@teambit/staged-components.side-bar';
import { EmptyBox } from '@teambit/staged-components.empty-box';
import { gql } from 'apollo-boost';
import head from 'lodash.head';
import R from 'ramda';
import React, { useContext, useEffect, useReducer, useState } from 'react';

import { Composition } from './composition';
import styles from './compositions.module.scss';
import { ComponentComposition } from './ui';
import { CompositionsPanel } from './ui/compositions-panel/compositions-panel';

const GET_COMPONENT = gql`
  query($id: String!) {
    getHost {
      getDocs(id: $id) {
        properties {
          name
          description
          required
          type
          default: defaultValue {
            value
          }
        }
      }
    }
  }
`;

export function Compositions() {
  const component = useContext(ComponentContext);
  // const compositions = useCompositions();
  const [selected, selectComposition] = useState(head(component.compositions));
  const { data } = useQuery(GET_COMPONENT, {
    variables: { id: component.id._legacy.name },
  });
  const properties = R.path(['getHost', 'getDocs', 'properties'], data);
  // reset selected composition when component changes.
  // this does trigger renderer, but perf seems to be ok
  useEffect(() => {
    selectComposition(component.compositions[0]);
  }, [component]);

  const [isSidebarOpen, handleSidebarToggle] = useReducer((x) => !x, component.compositions.length > 0);
  const sidebarOpenness = isSidebarOpen ? Layout.row : Layout.left;

  const compositionUrl = `${component.server.url}/#${component.id.fullName}?preview=compositions&`;

  return (
    <SplitPane layout={sidebarOpenness} size="85%" className={styles.compositionsPage}>
      <Pane className={styles.left}>
        <CompositionContent component={component} selected={selected} />
      </Pane>
      <HoverSplitter className={styles.splitter}>
        <Collapser
          id="compositionsCollapser"
          placement="left"
          isOpen={isSidebarOpen}
          onMouseDown={(e) => e.stopPropagation()} // avoid split-pane drag
          onClick={handleSidebarToggle}
          tooltipContent={`${isSidebarOpen ? 'Hide' : 'Show'} side compositions`}
          className={styles.collapser}
        />
      </HoverSplitter>
      <Pane className={styles.right}>
        <ThemeContext>
          <TabContainer className={styles.tabsContainer}>
            <TabList className={styles.tabs}>
              <Tab>compositions</Tab>
              <Tab>properties</Tab>
            </TabList>
            <TabPanel className={styles.tabContent}>
              <CompositionsPanel
                onSelectComposition={selectComposition}
                url={compositionUrl}
                compositions={component.compositions}
                active={selected}
                className={styles.compost}
              />
            </TabPanel>
            <TabPanel className={styles.tabContent}>
              {properties && properties.length > 0 ? <PropTable rows={properties} showListView /> : <div />}
            </TabPanel>
          </TabContainer>
        </ThemeContext>
      </Pane>
    </SplitPane>
  );
}

type CompositionContentProps = {
  component: ComponentModel;
  selected?: Composition;
};

function CompositionContent({ component, selected }: CompositionContentProps) {
  if (component.compositions.length === 0)
    return (
      <EmptyBox
        title="There are no compositions for this component."
        linkText="Learn how to create compositions"
        link="https://bit-new-docs.netlify.app/docs/compositions/develop-in-isolation"
      />
    );
  return <ComponentComposition component={component} composition={selected}></ComponentComposition>;
}
