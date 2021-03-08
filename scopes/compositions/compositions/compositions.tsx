import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { SplitPane, Pane, Layout } from '@teambit/base-ui.surfaces.split-pane.split-pane';
import { HoverSplitter } from '@teambit/base-ui.surfaces.split-pane.hover-splitter';
import { ComponentContext, ComponentModel } from '@teambit/component';
import { PropTable } from '@teambit/documenter.ui.property-table';
import { Tab, TabContainer, TabList, TabPanel } from '@teambit/panels';
import { useDocs } from '@teambit/ui.queries.get-docs';
import { Collapser } from '@teambit/ui.buttons.collapser';
import { EmptyBox } from '@teambit/ui.empty-box';
import { toPreviewUrl } from '@teambit/ui.component-preview';
import { useIsMobile } from '@teambit/ui.hooks.use-is-mobile';
import head from 'lodash.head';
import React, { useContext, useEffect, useState, useRef, useMemo, useReducer } from 'react';

import { Composition } from './composition';
import styles from './compositions.module.scss';
import { ComponentComposition } from './ui';
import { CompositionsPanel } from './ui/compositions-panel/compositions-panel';

export function Compositions() {
  const component = useContext(ComponentContext);
  const [selected, selectComposition] = useState(head(component.compositions));
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const properties = useDocs(component.id);

  // reset selected composition when component changes.
  // this does trigger renderer, but perf seems to be ok
  useEffect(() => {
    const prevId = selectedRef.current?.identifier;
    const next = component.compositions.find((c) => c.identifier === prevId) || component.compositions[0];

    selectComposition(next);
  }, [component]);
  const isMobile = useIsMobile();
  const showSidebar = useMemo(() => !isMobile && component.compositions.length > 0, [component.compositions.length]);
  const [isSidebarOpen, setSidebarOpenness] = useReducer((x) => !x, showSidebar);
  const sidebarOpenness = isSidebarOpen ? Layout.row : Layout.left;

  const compositionUrl = toPreviewUrl(component, 'compositions');

  return (
    <SplitPane layout={sidebarOpenness} size="85%" className={styles.compositionsPage}>
      <Pane className={styles.left}>
        <CompositionContent component={component} selected={selected} />
      </Pane>
      <HoverSplitter className={styles.splitter}>
        <Collapser
          placement="left"
          isOpen={isSidebarOpen}
          onMouseDown={(e) => e.stopPropagation()} // avoid split-pane drag
          onClick={() => setSidebarOpenness()}
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
