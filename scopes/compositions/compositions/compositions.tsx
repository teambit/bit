import type { ReactNode } from 'react';
import React, { useContext, useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import classNames from 'classnames';
import head from 'lodash.head';
import queryString from 'query-string';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { SplitPane, Pane, Layout } from '@teambit/base-ui.surfaces.split-pane.split-pane';
import { HoverSplitter } from '@teambit/base-ui.surfaces.split-pane.hover-splitter';
import type { ComponentModel } from '@teambit/component';
import { ComponentContext } from '@teambit/component';
import { PropTable } from '@teambit/documenter.ui.property-table';
import { Tab, TabContainer, TabList, TabPanel } from '@teambit/panels';
import { useDocs } from '@teambit/docs.ui.queries.get-docs';
import { Collapser } from '@teambit/ui-foundation.ui.buttons.collapser';
import { EmptyBox } from '@teambit/design.ui.empty-box';
import {
  PreviewPropsAggregator,
  SandboxPermissionsAggregator,
  toPreviewUrl,
} from '@teambit/preview.ui.component-preview';
import { useIsMobile } from '@teambit/ui-foundation.ui.hooks.use-is-mobile';
import { CompositionsMenuBar } from '@teambit/compositions.ui.compositions-menu-bar';
import { CompositionContextProvider } from '@teambit/compositions.ui.hooks.use-composition';
import { MDXLayout } from '@teambit/mdx.ui.mdx-layout';
import { Separator } from '@teambit/design.ui.separator';
import { H1 } from '@teambit/documenter.ui.heading';
import { AlertCard } from '@teambit/design.ui.alert-card';
import { Link as BaseLink, useNavigate, useLocation } from '@teambit/base-react.navigation.link';
import { OptionButton } from '@teambit/design.ui.input.option-button';
import { StatusMessageCard } from '@teambit/design.ui.surfaces.status-message-card';
import { Tooltip } from '@teambit/design.ui.tooltip';
import { Icon } from '@teambit/evangelist.elements.icon';
import type { UseLiveControlsResult } from '@teambit/compositions.ui.composition-live-controls';
import { useLiveControls } from '@teambit/compositions.ui.composition-live-controls';
import type {
  EmptyStateSlot,
  CompositionsMenuSlot,
  UsePreviewSandboxSlot,
  UsePreviewPropsSlot,
} from './compositions.ui.runtime';
import type { Composition } from './composition';
import styles from './compositions.module.scss';
import { ComponentComposition } from './ui';
import { CompositionsPanel } from './ui/compositions-panel/compositions-panel';
import { LiveControls } from './ui/compositions-panel/live-control-panel';
import type { ComponentCompositionProps } from './ui/composition-preview';
import { useDefaultControlsSchemaResponder } from './use-default-controls-schema-responder';

// @todo - this will be fixed as part of the @teambit/base-react.navigation.link upgrade to latest
const Link = BaseLink as any;

export type MenuBarWidget = {
  location: 'start' | 'end';
  content: ReactNode;
};
export type CompositionsProp = {
  menuBarWidgets?: CompositionsMenuSlot;
  emptyState?: EmptyStateSlot;
  usePreviewSandboxSlot?: UsePreviewSandboxSlot;
  /**
   * per-component resolvers for iframe attributes on the composition preview (`allow`,
   * `referrerPolicy`, ...). Each resolver gets the current `ComponentModel`; results merge
   * with later registrations winning. Default `allow` (`clipboard-write`) lives on
   * `ComponentPreview` and applies when no resolver overrides it.
   */
  usePreviewPropsSlot?: UsePreviewPropsSlot;
  enableLiveControls?: boolean;
};

export function Compositions({
  menuBarWidgets,
  emptyState,
  usePreviewSandboxSlot,
  usePreviewPropsSlot,
  enableLiveControls = true,
}: CompositionsProp) {
  const component = useContext(ComponentContext);
  const componentIdStr = component.id.toString();
  const [searchParams] = useSearchParams();
  const params = useParams();
  const versionFromQueryParams = searchParams.get('version');
  const navigate = useNavigate();
  const location = useLocation();
  const currentCompositionName = params['*'];
  const currentComposition =
    component.compositions.find((composition) => composition.identifier.toLowerCase() === currentCompositionName) ||
    head(component.compositions);
  const [sandboxValue, setSandboxValue] = useState('');
  const selectedRef = useRef(currentComposition);
  selectedRef.current = currentComposition;
  useDefaultControlsSchemaResponder(componentIdStr, enableLiveControls);

  const properties = useDocs(component.id);
  const previewSandboxHooks = usePreviewSandboxSlot?.values() ?? [];
  const previewPropsHooks = usePreviewPropsSlot?.values() ?? [];
  const isMobile = useIsMobile();
  const showSidebar = !isMobile && component.compositions.length > 0;
  const [isSidebarOpen, setSidebarOpenness] = useState(showSidebar);

  const sidebarOpenness = isSidebarOpen ? Layout.row : Layout.left;

  const compositionUrl = toPreviewUrl(component, 'compositions');
  const isScaling = component?.preview?.isScaling;
  const includesEnvTemplates = component?.preview?.includesEnvTemplate;
  const useNameParam = component?.preview?.useNameParam;
  const compositionIdentifierParam =
    useNameParam || (isScaling && includesEnvTemplates === false)
      ? `name=${currentComposition?.identifier}`
      : currentComposition?.identifier;

  const currentCompositionFullUrl = toPreviewUrl(component, 'compositions', compositionIdentifierParam);

  const [compositionParams, setCompositionParams] = useState<Record<string, any>>(() =>
    enableLiveControls ? { fullscreen: true, livecontrols: true } : { fullscreen: true }
  );

  const queryParams = useMemo(() => queryString.stringify(compositionParams), [compositionParams]);

  // Tracks compositions the user has explicitly collapsed. Anything not in
  // this set defaults to expanded, which gives us "auto-open on load" as a
  // pure derivation rather than an effect.
  const [collapsedCompositions, setCollapsedCompositions] = useState<Set<string>>(() => new Set());
  const [isDraggingTray, setIsDraggingTray] = useState(false);
  const trayRef = useRef<HTMLDivElement | null>(null);
  // `null` = auto-size to content (default). Becomes a number once the user
  // drag-resizes — only then do we pin a fixed height.
  const [trayHeight, setTrayHeight] = useState<number | null>(null);
  const { ready, defs, values, onChange } = useLiveControls();

  const onResizeStripMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startY = e.clientY;
    // Seed the drag from the tray's current rendered height — handles the
    // initial auto-sized case (where `trayHeight` is still null).
    const startHeight = trayRef.current?.offsetHeight ?? 0;
    const parentEl = trayRef.current?.parentElement;
    const parentHeight = parentEl?.clientHeight ?? window.innerHeight;
    const maxHeight = Math.max(120, parentHeight - 80);
    setIsDraggingTray(true);
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
    // Mutate the tray's inline height directly and rAF-throttle, so dragging
    // doesn't re-render the whole compositions tree (including the iframe)
    // on every mousemove. State is committed once on mouseup.
    let pendingHeight = startHeight;
    let rafScheduled = false;
    const applyHeight = () => {
      rafScheduled = false;
      if (trayRef.current) trayRef.current.style.height = `${pendingHeight}px`;
    };
    const onMove = (ev: MouseEvent) => {
      const delta = startY - ev.clientY;
      pendingHeight = Math.max(120, Math.min(maxHeight, startHeight + delta));
      if (!rafScheduled) {
        rafScheduled = true;
        requestAnimationFrame(applyHeight);
      }
    };
    const onUp = () => {
      setIsDraggingTray(false);
      setTrayHeight(pendingHeight);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  // collapse sidebar when empty, reopen when not
  useEffect(() => setSidebarOpenness(showSidebar), [showSidebar]);
  useEffect(() => {
    if (enableLiveControls) {
      setCompositionParams((current) => {
        if (current.livecontrols === true) return current;
        return { ...current, livecontrols: true };
      });
      return;
    }

    setCompositionParams((current) => {
      if (!('livecontrols' in current)) return current;
      const next = { ...current };
      delete next.livecontrols;
      return next;
    });
  }, [enableLiveControls]);

  const currentCompositionHasControls = ready && defs.length > 0;
  const currentCompositionIdentifier = currentComposition?.identifier;
  const isTrayCollapsedForCurrent =
    !!currentCompositionIdentifier && collapsedCompositions.has(currentCompositionIdentifier);
  const showControlsTray = currentCompositionHasControls;
  const isTrayCollapsed = showControlsTray && isTrayCollapsedForCurrent;

  const toggleTrayCollapsed = useCallback(() => {
    if (!currentCompositionIdentifier) return;
    setCollapsedCompositions((prev) => {
      const next = new Set(prev);
      if (next.has(currentCompositionIdentifier)) next.delete(currentCompositionIdentifier);
      else next.add(currentCompositionIdentifier);
      return next;
    });
  }, [currentCompositionIdentifier]);

  return (
    <CompositionContextProvider queryParams={compositionParams} setQueryParams={setCompositionParams}>
      <SplitPane layout={sidebarOpenness} size="80%" className={styles.compositionsPage}>
        <Pane className={styles.left}>
          <CompositionsMenuBar menuBarWidgets={menuBarWidgets} className={styles.menuBar}>
            <Tooltip content={'Open in new tab'} placement="bottom">
              <Link external href={currentCompositionFullUrl} className={styles.toolbarButton}>
                <OptionButton icon="open-tab" />
              </Link>
            </Tooltip>
          </CompositionsMenuBar>
          <SandboxPermissionsAggregator
            hooks={previewSandboxHooks}
            onSandboxChange={setSandboxValue}
            component={component}
          />
          <div className={styles.previewArea}>
            {isDraggingTray && <div className={styles.dragOverlay} />}
            <PreviewPropsAggregator hooks={previewPropsHooks} component={component}>
              {(previewAttrs) => (
                <CompositionContent
                  {...previewAttrs}
                  className={styles.compositionPanel}
                  emptyState={emptyState}
                  component={component}
                  selected={currentComposition}
                  queryParams={queryParams}
                  sandbox={sandboxValue}
                />
              )}
            </PreviewPropsAggregator>
            {showControlsTray && (
              <LiveControlsTray
                trayRef={trayRef}
                collapsed={isTrayCollapsed}
                height={trayHeight}
                ready={ready}
                defs={defs}
                values={values}
                onChange={onChange}
                onResizeStripMouseDown={onResizeStripMouseDown}
                onToggleExpanded={toggleTrayCollapsed}
              />
            )}
          </div>
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
                  useNameParam={useNameParam}
                  includesEnvTemplate={component.preview?.includesEnvTemplate}
                  hasLiveControls={currentCompositionHasControls}
                  liveControlsActive={currentCompositionHasControls && !isTrayCollapsedForCurrent}
                  onToggleLiveControls={toggleTrayCollapsed}
                  onSelectComposition={(composition) => {
                    if (!currentComposition || !location) return;
                    const selectedCompositionFromUrl = params['*'];

                    const pathSegments = location.pathname.split('/').filter((x) => x);

                    if (!selectedCompositionFromUrl) {
                      pathSegments.push(composition.identifier.toLowerCase());
                    } else {
                      pathSegments[pathSegments.length - 1] = composition.identifier.toLowerCase();
                    }

                    const urlParams = new URLSearchParams(searchParams);
                    if (versionFromQueryParams) {
                      urlParams.set('version', versionFromQueryParams);
                    }
                    const newPath = pathSegments.join('/');
                    navigate(`/${newPath}?${urlParams.toString()}`);
                  }}
                  url={compositionUrl}
                  compositions={component.compositions}
                  active={currentComposition}
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

type LiveControlsTrayProps = {
  trayRef: React.RefObject<HTMLDivElement | null>;
  collapsed: boolean;
  height: number | null;
  ready: boolean;
  defs: UseLiveControlsResult['defs'];
  values: UseLiveControlsResult['values'];
  onChange: UseLiveControlsResult['onChange'];
  onResizeStripMouseDown: (e: React.MouseEvent) => void;
  onToggleExpanded: () => void;
};

function LiveControlsTray({
  trayRef,
  collapsed,
  height,
  ready,
  defs,
  values,
  onChange,
  onResizeStripMouseDown,
  onToggleExpanded,
}: LiveControlsTrayProps) {
  // height = null → let CSS size the tray to its content (with the max-height
  // clamp doing the upper bound); height = number → user has drag-resized,
  // pin to that.
  const trayStyle = collapsed || height === null ? undefined : { height };
  return (
    <div
      ref={trayRef}
      className={classNames(styles.controlsTray, collapsed && styles.controlsTrayCollapsed)}
      style={trayStyle}
    >
      {!collapsed && (
        <div
          className={styles.trayResizeStrip}
          onMouseDown={onResizeStripMouseDown}
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize live controls"
          title="Drag to resize"
        >
          <div className={styles.trayDragBar} />
        </div>
      )}
      <div
        className={styles.trayHeaderInner}
        onClick={onToggleExpanded}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleExpanded();
          }
        }}
        title={collapsed ? 'Click to expand' : 'Click to collapse'}
      >
        <div className={styles.trayTitleRow}>
          <Icon of="settings" className={styles.trayIcon} />
          <span className={styles.trayTitle}>Live Controls</span>
          {ready && defs.length > 0 && <span className={styles.trayBadge}>{defs.length}</span>}
        </div>
        <span
          className={classNames(styles.trayCollapseIcon, collapsed && styles.trayCollapseIconCollapsed)}
          aria-hidden
        >
          <Icon of="right-rounded-corners" />
        </span>
      </div>
      {!collapsed && (
        <div className={styles.trayBody}>
          {ready ? (
            <LiveControls defs={defs} values={values} onChange={onChange} />
          ) : (
            <div className={styles.trayEmpty}>No live controls available for this composition</div>
          )}
        </div>
      )}
    </div>
  );
}

export type CompositionContentProps = {
  component: ComponentModel;
  selected?: Composition;
  queryParams?: string | string[];
  emptyState?: EmptyStateSlot;
} & ComponentCompositionProps;

export function CompositionContent({
  component,
  selected,
  queryParams,
  emptyState,
  sandbox,
  ...componentCompositionProps
}: CompositionContentProps) {
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
        link={`https://bit.dev/reference/dev-services-overview/compositions/compositions-overview`}
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
      sandbox={sandbox}
      {...componentCompositionProps}
    />
  );
}
