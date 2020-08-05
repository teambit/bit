import React, { useContext, useState, useEffect } from 'react';
import head from 'lodash.head';
import { gql } from 'apollo-boost';
import { useQuery } from '@apollo/react-hooks';
import R from 'ramda';
import { TupleSplitPane } from '@bit/bit.gui.atoms.tuple-split-pane';
import { Layout } from '@bit/bit.rendering.constants.layouts';
import { PropTable } from '@teambit/documenter-temp.ui.property-table';
import { CollapsibleSplitter } from '../../components/stage-components/splitter';
import { ComponentContext } from '../component/ui';
import { CompositionsPanel } from './ui/compositions-panel/compositions-panel';
import { ComponentComposition } from './ui';
import { TabContainer, Tab, TabList, TabPanel } from '../panel-ui/ui/tabs';
import { PanelContainer, Panel } from '../panel-ui/ui/panel-container';
// import { useCompositions } from './ui/use-compositions';

import styles from './compositions.module.scss';

const GET_COMPONENT = gql`
  query($id: String!) {
    workspace {
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
        <ComponentComposition component={component} composition={selected}></ComponentComposition>
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
