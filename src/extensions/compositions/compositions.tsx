import React, { useContext, useState, useEffect } from 'react';
import head from 'lodash.head';
import { ComponentContext } from '../component/ui';
import { CompositionsPanel } from './ui/compositions-panel/compositions-panel';
import { ComponentComposition } from './ui';
import { TabContainer, Tab, TabList, TabPanel } from '../panel-ui/ui/tabs';
import { PanelContainer, Panel } from '../panel-ui/ui/panel-container';

import styles from './compositions.module.scss';

export function Compositions() {
  const component = useContext(ComponentContext);
  const [selected, selectComposition] = useState(head(component.compositions));

  // reset selected composition when component changes.
  // this does trigger rerender, but perf seems to be ok
  useEffect(() => {
    selectComposition(component.compositions[0]);
  }, [component]);

  return (
    <PanelContainer className={styles.compositionsPage}>
      <ComponentComposition component={component} composition={selected}></ComponentComposition>
      <Panel>
        <TabContainer>
          <TabList>
            <Tab>compositions</Tab>
            <Tab>properties</Tab>
            <Tab>dependencies</Tab>
          </TabList>
          <TabPanel>
            <CompositionsPanel onSelect={selectComposition} compositions={component.compositions} active={selected} />
          </TabPanel>
          <TabPanel></TabPanel>
          <TabPanel></TabPanel>
        </TabContainer>
      </Panel>
    </PanelContainer>
  );
}
