import React, { useContext, useState, useEffect } from 'react';
import { ComponentContext } from '../component/ui';
import { CompositionsPanel } from './ui/compositions-panel/compositions-panel';
import { ComponentComposition } from './ui';
import { TabContainer, Tab, TabList, TabPanel } from '../panel-ui/ui/tabs';
import { PanelContainer, Panel } from '../panel-ui/ui/panel-container';
import styles from './compositions.module.scss';

export function Compositions() {
  const component = useContext(ComponentContext);
  const [composition, setComposition] = useState(component.compositions[0]);

  // make sure to update state upon component model change.
  useEffect(() => {
    setComposition(component.compositions[0]);
  }, [component]);

  return (
    <PanelContainer className={styles.compositionsPage}>
      <ComponentComposition component={component} composition={composition}></ComponentComposition>
      <Panel>
        <TabContainer>
          <TabList>
            <Tab>compositions</Tab>
            <Tab>properties</Tab>
            <Tab>dependencies</Tab>
          </TabList>
          <TabPanel>
            <CompositionsPanel onCompositionSelect={setComposition} compositions={component.compositions} />
          </TabPanel>
          <TabPanel></TabPanel>
          <TabPanel></TabPanel>
        </TabContainer>
      </Panel>
    </PanelContainer>
  );
}
