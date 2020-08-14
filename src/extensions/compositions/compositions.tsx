import React, { useContext, useState, useEffect } from 'react';
import head from 'lodash.head';
import { gql } from 'apollo-boost';
import { useQuery } from '@apollo/react-hooks';
import R from 'ramda';
import { TupleSplitPane } from '@teambit/base-ui-temp.surfaces.tuple-split-pane';
import { Layout } from '@teambit/base-ui-temp.layout.split-pane-layout';
import { PropTable } from '@teambit/documenter-temp.ui.property-table';
import { EmptyCompositions } from './ui/empty-compositions/empty-compositions';
import { CollapsibleSplitter } from '../../components/stage-components/splitter';
import { Composition } from './composition';
import { ComponentModel } from '../component';
import { ComponentContext } from '../component/ui';
import { CompositionsPanel } from './ui/compositions-panel/compositions-panel';
import { ComponentComposition } from './ui';
import { TabContainer, Tab, TabList, TabPanel } from '../panel-ui';
import { PanelContainer, Panel } from '../panel-ui';
import styles from './compositions.module.scss';

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
  const properties = R.path(['workspace', 'getDocs', 'properties'], data);

  // reset selected composition when component changes.
  // this does trigger renderer, but perf seems to be ok
  useEffect(() => {
    selectComposition(component.compositions[0]);
  }, [component]);
  const compositionUrl = `${component.server.url}/#${component.id.fullName}?preview=compositions&`;
  return (
    <PanelContainer className={styles.compositionsPage}>
      <TupleSplitPane max={100} min={10} layout={Layout.row} Splitter={CollapsibleSplitter}>
        <CompositionContent component={component} selected={selected} />
        <Panel>
          <TabContainer>
            <TabList>
              <Tab>compositions</Tab>
              <Tab>properties</Tab>
              <Tab>dependencies</Tab>
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
                <PropTable rows={properties} />
              ) : (
                // TODO - make this look good
                <div>no props</div>
              )}
            </TabPanel>
            <TabPanel></TabPanel>
          </TabContainer>
        </Panel>
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
