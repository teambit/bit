import { useQuery } from '@apollo/react-hooks';
import { Layout } from '@teambit/base-ui-temp.layout.split-pane-layout';
import { TupleSplitPane } from '@teambit/base-ui-temp.surfaces.tuple-split-pane';
import { ComponentContext, ComponentModel } from '@teambit/component';
import { PropTable } from '@teambit/documenter-temp.ui.property-table';
import { Panel, PanelContainer, Tab, TabContainer, TabList, TabPanel } from '@teambit/panels';
import { Collapser } from '@teambit/staged-components.side-bar';
import { CollapsibleSplitter } from '@teambit/staged-components.splitter';
import { gql } from 'apollo-boost';
import head from 'lodash.head';
import R from 'ramda';
import React, { useContext, useEffect, useReducer, useState } from 'react';

import { Composition } from './composition';
import styles from './compositions.module.scss';
import { ComponentComposition } from './ui';
import { CompositionsPanel } from './ui/compositions-panel/compositions-panel';
import { EmptyCompositions } from './ui/empty-compositions/empty-compositions';

const GET_COMPONENT = gql`
  query($id: String!) {
    getHost {
      getDocs(id: $id) {
        properties {
          name
          description
          required
          type
          defaultValue {
            value
            computed
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
    variables: { id: component.id.legacyComponentId.name },
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
    <PanelContainer className={styles.compositionsPage}>
      <TupleSplitPane max={100} min={10} layout={sidebarOpenness} Splitter={CollapsibleSplitter}>
        <div className={styles.left}>
          <CompositionContent component={component} selected={selected} />
        </div>
        <div className={styles.right}>
          <Collapser
            id="compositionsCollapser"
            placement="left"
            isOpen={isSidebarOpen}
            onClick={handleSidebarToggle}
            tooltipContent={`${isSidebarOpen ? 'Hide' : 'Show'} side panel`}
            className={styles.collapser}
          />
          <Panel>
            <TabContainer>
              <TabList>
                <Tab>compositions</Tab>
                <Tab>properties</Tab>
              </TabList>
              <TabPanel>
                <CompositionsPanel
                  onSelect={selectComposition}
                  url={compositionUrl}
                  compositions={component.compositions}
                  active={selected}
                />
              </TabPanel>
              <TabPanel>
                {properties && properties.length > 0 ? (
                  // TODO - make table look good in panel
                  <PropTable rows={properties} showListView />
                ) : (
                  <div />
                )}
              </TabPanel>
              <TabPanel></TabPanel>
            </TabContainer>
          </Panel>
        </div>
      </TupleSplitPane>
    </PanelContainer>
  );
}

type CompositionContentProps = {
  component: ComponentModel;
  selected?: Composition;
};

function CompositionContent({ component, selected }: CompositionContentProps) {
  if (component.compositions.length === 0) return <EmptyCompositions />;
  return <ComponentComposition component={component} composition={selected}></ComponentComposition>;
}
