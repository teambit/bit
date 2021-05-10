import React, { useContext, useEffect, useState, useMemo, useRef, ReactNode } from 'react';
import head from 'lodash.head';
import queryString from 'query-string';
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
import { CompositionsMenuBar } from '@teambit/ui.compositions-menu-bar';
import { CompositionContextProvider } from '@teambit/ui.hooks.use-composition';
import { NativeLink } from '@teambit/ui.routing.native-link';
import { OptionButton } from '@teambit/ui.input.option-button';
import { EmptyStateSlot } from './compositions.ui.runtime';
import { Composition } from './composition';
import styles from './compositions.module.scss';
import { ComponentComposition } from './ui';
import { CompositionsPanel } from './ui/compositions-panel/compositions-panel';
import type { CompositionsMenuSlot } from './compositions.ui.runtime';

export type MenuBarWidget = {
  location: 'start' | 'end';
  content: ReactNode;
};
export type CompositionsProp = { menuBarWidgets?: CompositionsMenuSlot; emptyState?: EmptyStateSlot };

export function Compositions({ menuBarWidgets, emptyState }: CompositionsProp) {
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
  const showSidebar = !isMobile && component.compositions.length > 0;
  const [isSidebarOpen, setSidebarOpenness] = useState(showSidebar);

  const sidebarOpenness = isSidebarOpen ? Layout.row : Layout.left;

  const compositionUrl = toPreviewUrl(component, 'compositions');
  const currentCompositionUrl = toPreviewUrl(component, 'compositions', selected?.identifier);

  const [compositionParams, setCompositionParams] = useState<Record<string, any>>({});
  const queryParams = useMemo(() => queryString.stringify(compositionParams), [compositionParams]);

  // collapse sidebar when empty, reopen when not
  useEffect(() => setSidebarOpenness(showSidebar), [showSidebar]);

  return (
    <CompositionContextProvider queryParams={compositionParams} setQueryParams={setCompositionParams}>
      <SplitPane layout={sidebarOpenness} size="85%" className={styles.compositionsPage}>
        <Pane className={styles.left}>
          <CompositionsMenuBar menuBarWidgets={menuBarWidgets} className={styles.menuBar}>
            <NativeLink external href={currentCompositionUrl} className={styles.openInNewTab}>
              <OptionButton icon="open-tab" />
            </NativeLink>
          </CompositionsMenuBar>
          <CompositionContent
            emptyState={emptyState}
            component={component}
            selected={selected}
            queryParams={queryParams}
          />
        </Pane>
        <HoverSplitter className={styles.splitter}>
          <Collapser
            placement="left"
            isOpen={isSidebarOpen}
            onMouseDown={(e) => e.stopPropagation()} // avoid split-pane drag
            onClick={() => setSidebarOpenness((x) => !x)}
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
    </CompositionContextProvider>
  );
}

type CompositionContentProps = {
  component: ComponentModel;
  selected?: Composition;
  queryParams?: string | string[];
  emptyState?: EmptyStateSlot;
};

function CompositionContent({ component, selected, queryParams, emptyState }: CompositionContentProps) {
  const env = component.environment?.id;
  const EmptyStateTemplate = emptyState?.get(env || ''); // || defaultTemplate;

  if (component.compositions.length === 0 && component.host === 'teambit.workspace/workspace' && EmptyStateTemplate) {
    return <EmptyStateTemplate />;
  }

  if (component.compositions.length === 0) {
    return (
      <EmptyBox
        title="There are no compositions for this component."
        linkText="Learn how to create compositions"
        link="https://harmony-docs.bit.dev/compositions/overview/"
      />
    );
  }

  return (
    <ComponentComposition
      className={styles.compositionsIframe}
      component={component}
      composition={selected}
      queryParams={queryParams}
    />
  );
}
