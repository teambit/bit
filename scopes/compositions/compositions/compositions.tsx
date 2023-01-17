import React, { useContext, useEffect, useState, useMemo, useRef, ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import head from 'lodash.head';
import queryString from 'query-string';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { SplitPane, Pane, Layout } from '@teambit/base-ui.surfaces.split-pane.split-pane';
import { HoverSplitter } from '@teambit/base-ui.surfaces.split-pane.hover-splitter';
import { ComponentContext, ComponentModel } from '@teambit/component';
import { PropTable } from '@teambit/documenter.ui.property-table';
import { Tab, TabContainer, TabList, TabPanel } from '@teambit/panels';
import { useDocs } from '@teambit/docs.ui.queries.get-docs';
import { Collapser } from '@teambit/ui-foundation.ui.buttons.collapser';
import { EmptyBox } from '@teambit/design.ui.empty-box';
import { toPreviewUrl } from '@teambit/preview.ui.component-preview';
import { useIsMobile } from '@teambit/ui-foundation.ui.hooks.use-is-mobile';
import { CompositionsMenuBar } from '@teambit/compositions.ui.compositions-menu-bar';
import { CompositionContextProvider } from '@teambit/compositions.ui.hooks.use-composition';
import { MDXLayout } from '@teambit/mdx.ui.mdx-layout';
import { Separator } from '@teambit/design.ui.separator';
import { H1 } from '@teambit/documenter.ui.heading';
import { AlertCard } from '@teambit/design.ui.alert-card';
import { Link, useNavigate, useLocation } from '@teambit/base-react.navigation.link';
import { OptionButton } from '@teambit/design.ui.input.option-button';
import { StatusMessageCard } from '@teambit/design.ui.surfaces.status-message-card';
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
  // const [searchParams, setSearchParams] = useSearchParams();
  const params = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const currentCompositionName = params['*'];
  // console.log(routes);
  const currentComposition =
    component.compositions.find((composition) => composition.identifier.toLowerCase() === currentCompositionName) ||
    head(component.compositions);
  // const [selected, selectComposition] = useState(head(component.compositions));
  const selectedRef = useRef(currentComposition);
  selectedRef.current = currentComposition;

  const properties = useDocs(component.id);

  // reset selected composition when component changes.
  // this does trigger renderer, but perf seems to be ok
  // useEffect(() => {
  //   const prevId = selectedRef.current?.identifier;
  //   const next = component.compositions.find((c) => c.identifier === prevId) || component.compositions[0];

  //   navigate(next.displayName.toLowerCase().replaceAll(' ', '-'));
  // }, [component]);
  const isMobile = useIsMobile();
  const showSidebar = !isMobile && component.compositions.length > 0;
  const [isSidebarOpen, setSidebarOpenness] = useState(showSidebar);

  const sidebarOpenness = isSidebarOpen ? Layout.row : Layout.left;

  const compositionUrl = toPreviewUrl(component, 'compositions');
  const isScaling = component?.preview?.isScaling;
  const compositionIdentifierParam = isScaling
    ? `name=${currentComposition?.identifier}`
    : currentComposition?.identifier;
  const currentCompositionFullUrl = toPreviewUrl(component, 'compositions', compositionIdentifierParam);

  const [compositionParams, setCompositionParams] = useState<Record<string, any>>({});
  const queryParams = useMemo(() => queryString.stringify(compositionParams), [compositionParams]);

  // collapse sidebar when empty, reopen when not
  useEffect(() => setSidebarOpenness(showSidebar), [showSidebar]);
  return (
    <CompositionContextProvider queryParams={compositionParams} setQueryParams={setCompositionParams}>
      <SplitPane layout={sidebarOpenness} size="85%" className={styles.compositionsPage}>
        <Pane className={styles.left}>
          <CompositionsMenuBar menuBarWidgets={menuBarWidgets} className={styles.menuBar}>
            <Link external href={currentCompositionFullUrl} className={styles.openInNewTab}>
              <OptionButton icon="open-tab" />
            </Link>
          </CompositionsMenuBar>
          <CompositionContent
            emptyState={emptyState}
            component={component}
            selected={currentComposition}
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
                  isScaling={isScaling}
                  onSelectComposition={(composition) => {
                    if (!currentComposition || !location) return;
                    if (location.pathname.includes(currentComposition.identifier.toLowerCase())) {
                      navigate(composition.identifier.toLowerCase());
                      return;
                    }

                    const path = location.pathname.replace(
                      currentComposition.identifier.toLowerCase(),
                      composition.identifier.toLowerCase()
                    );

                    if (!path) return;
                    if(!path.includes(composition.identifier.toLowerCase())) {
                      const nextPath = location.pathname.concat(`/${composition.identifier.toLowerCase()}`)
                      navigate(nextPath)
                      return;
                    }
                    navigate(path);
                  }}
                  url={compositionUrl}
                  compositions={component.compositions}
                  active={currentComposition}
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

export type CompositionContentProps = {
  component: ComponentModel;
  selected?: Composition;
  queryParams?: string | string[];
  emptyState?: EmptyStateSlot;
};

export function CompositionContent({ component, selected, queryParams, emptyState }: CompositionContentProps) {
  const env = component.environment?.id;
  const EmptyStateTemplate = emptyState?.get(env || ''); // || defaultTemplate;

  if (component.compositions.length === 0 && component.host === 'teambit.workspace/workspace' && EmptyStateTemplate) {
    return (
      <div className={styles.noCompositionsPage}>
        <div>
          <H1 className={styles.title}>Compositions</H1>
          <Separator isPresentational className={styles.separator} />
          <AlertCard
            level="info"
            title="There are no
              compositions for this Component. Learn how to add compositions:"
          >
            <MDXLayout>
              <EmptyStateTemplate />
            </MDXLayout>
          </AlertCard>
        </div>
      </div>
    );
  }

  if (component?.buildStatus === 'pending' && component?.host === 'teambit.scope/scope')
    return (
      <StatusMessageCard className={styles.buildStatusMessage} status="PROCESSING" title="component preview pending">
        this might take some time
      </StatusMessageCard>
    );
  if (component?.buildStatus === 'failed' && component?.host === 'teambit.scope/scope')
    return (
      <StatusMessageCard
        className={styles.buildStatusMessage}
        status="FAILURE"
        title="failed to get component preview "
      ></StatusMessageCard>
    );

  // TODO: get the docs domain from the community aspect and pass it here as a prop
  if (component.compositions.length === 0) {
    return (
      <EmptyBox
        title="There are no compositions for this component."
        linkText="Learn how to create compositions"
        link={`https://bit.dev/docs/dev-services-overview/compositions/compositions-overview`}
      />
    );
  }

  return (
    <ComponentComposition
      className={styles.compositionsIframe}
      // TODO: Oded to add control for viewport.
      viewport={null}
      component={component}
      forceHeight="100%"
      composition={selected}
      fullContentHeight
      pubsub={true}
      queryParams={queryParams}
    />
  );
}
