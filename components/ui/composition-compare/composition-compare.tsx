import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import classNames from 'classnames';
import { useComponentCompare } from '@teambit/component.ui.component-compare.context';
import {
  CompositionContent,
  LiveControlsDiffPanel,
  type CompositionContentProps,
  type EmptyStateSlot,
} from '@teambit/compositions';
import { CompositionContextProvider } from '@teambit/compositions.ui.hooks.use-composition';
import {
  useCompareQueryParam,
  useUpdatedUrlFromQuery,
} from '@teambit/component.ui.component-compare.hooks.use-component-compare-url';
import { CompareSplitLayoutPreset } from '@teambit/component.ui.component-compare.layouts.compare-split-layout-preset';
import { RoundLoader } from '@teambit/design.ui.round-loader';
import { Icon } from '@teambit/evangelist.elements.icon';
import queryString from 'query-string';
import { CompositionDropdown } from './composition-dropdown';
import { CompositionCompareContext } from './composition-compare.context';
import { uniqBy } from 'lodash';

import styles from './composition-compare.module.scss';

// No-op for context setQueryParams - compare view doesn't need to update params
const noop = () => {};

export type CompositionCompareProps = {
  emptyState?: EmptyStateSlot;
  Widgets?: {
    Right?: React.ReactNode;
    Left?: React.ReactNode;
  };
  previewViewProps?: CompositionContentProps;
  PreviewView?: React.ComponentType<CompositionContentProps>;
};

export function CompositionCompare(props: CompositionCompareProps) {
  const { emptyState, PreviewView = CompositionContent, Widgets, previewViewProps = {} } = props;

  const componentCompareContext = useComponentCompare();

  const { base, compare, baseContext, compareContext, loading: contextLoading } = componentCompareContext || {};
  const [isControlsOpen, setControlsOpen] = useState(true);
  const [controlsStatus, setControlsStatus] = useState<'loading' | 'available' | 'empty'>('loading');
  const [panelHeight, setPanelHeight] = useState(200);
  const panelRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  // Don't compute anything dependent on component IDs until loading is complete
  // to avoid rendering iframes with stale/changing IDs
  const isStableData = !contextLoading && base !== undefined && compare !== undefined;

  const baseCompositions = base?.model.compositions;
  const compareCompositions = compare?.model.compositions;

  const selectedCompositionBaseFile = useCompareQueryParam('compositionBaseFile');
  const selectedCompositionCompareFile = useCompareQueryParam('compositionCompareFile');

  const baseState = baseContext?.state?.preview;
  const compareState = compareContext?.state?.preview;
  const baseHooks = baseContext?.hooks?.preview;
  const compareHooks = compareContext?.hooks?.preview;
  const selectedBaseFromState = baseState?.id;
  const selectedCompareFromState = compareState?.id;

  const explicitCompositionId = selectedCompositionCompareFile || selectedCompositionBaseFile;
  const stateCompositionId = selectedCompareFromState || selectedBaseFromState;
  const defaultCompositionId = compareCompositions?.[0]?.identifier || baseCompositions?.[0]?.identifier;
  const requestedCompositionId = explicitCompositionId || stateCompositionId || defaultCompositionId;

  const selectedBaseComp = requestedCompositionId
    ? baseCompositions?.find((c) => c.identifier === requestedCompositionId)
    : baseCompositions?.[0];

  const selectedCompareComp = requestedCompositionId
    ? compareCompositions?.find((c) => c.identifier === requestedCompositionId)
    : compareCompositions?.[0];

  const baseMissing = Boolean(requestedCompositionId && !selectedBaseComp);
  const compareMissing = Boolean(requestedCompositionId && !selectedCompareComp);

  const baseCompositionIds = useMemo(
    () => new Set((baseCompositions || []).map((c) => c.identifier)),
    [baseCompositions]
  );
  const compareCompositionIds = useMemo(
    () => new Set((compareCompositions || []).map((c) => c.identifier)),
    [compareCompositions]
  );

  const compositionsDropdownSource = uniqBy(
    (baseCompositions || []).concat(compareCompositions || []),
    'identifier'
  )?.map((c) => {
    const hasInBase = baseCompositionIds.has(c.identifier);
    const hasInCompare = compareCompositionIds.has(c.identifier);
    const tag =
      hasInBase && hasInCompare ? undefined : hasInBase ? 'Base only' : hasInCompare ? 'Compare only' : undefined;

    const href = !compareState?.controlled
      ? useUpdatedUrlFromQuery({
          compositionBaseFile: c.identifier,
          compositionCompareFile: c.identifier,
        })
      : useUpdatedUrlFromQuery({});

    const onClick = compareState?.controlled
      ? (id, e) => {
          compareHooks?.onClick?.(id, e);
          baseHooks?.onClick?.(id, e);
        }
      : undefined;
    return { id: c.identifier, label: c.displayName, href, onClick, tag };
  });

  const selectedCompareDropdown =
    compositionsDropdownSource.find((item) => item.id === selectedCompareComp?.identifier) ||
    compositionsDropdownSource.find((item) => item.id === selectedBaseComp?.identifier) ||
    (requestedCompositionId
      ? { id: requestedCompositionId, label: requestedCompositionId, tag: 'Missing' }
      : undefined);

  const baseIdStr = base?.model.id?.toString();
  const compareIdStr = compare?.model.id?.toString();
  const baseCompId = selectedBaseComp?.identifier || requestedCompositionId;
  const compareCompId = selectedCompareComp?.identifier || requestedCompositionId;

  // Channel keys - only valid when we have real IDs
  const baseChannelKey = useMemo(
    () => (baseIdStr && baseCompId ? `base:${baseIdStr}:${baseCompId}` : undefined),
    [baseIdStr, baseCompId]
  );
  const compareChannelKey = useMemo(
    () => (compareIdStr && compareCompId ? `compare:${compareIdStr}:${compareCompId}` : undefined),
    [compareIdStr, compareCompId]
  );

  // Compute query params directly - no need for useState + useEffect sync
  const baseCompositionParams = useMemo(
    () => ({ livecontrols: true, ...(baseChannelKey && { lcchannel: baseChannelKey }) }),
    [baseChannelKey]
  );
  const baseCompQueryParams = useMemo(() => queryString.stringify(baseCompositionParams), [baseCompositionParams]);

  const compareCompositionParams = useMemo(
    () => ({ livecontrols: true, ...(compareChannelKey && { lcchannel: compareChannelKey }) }),
    [compareChannelKey]
  );
  const compareCompQueryParams = useMemo(
    () => queryString.stringify(compareCompositionParams),
    [compareCompositionParams]
  );

  const controlsResetKey = `${baseChannelKey || ''}-${compareChannelKey || ''}`;

  // Track if we've ever had controls - once shown, keep panel visible during transitions
  const [everHadControls, setEverHadControls] = useState(false);

  // Reset everHadControls when component IDs change (not just composition)
  useEffect(() => {
    setEverHadControls(false);
    setControlsStatus('loading');
  }, [baseIdStr, compareIdStr]);

  const handleControlsStatusChange = useCallback((status: 'loading' | 'available' | 'empty') => {
    setControlsStatus(status);
    if (status === 'available') {
      setEverHadControls(true);
    }
  }, []);

  // Show panel if: currently available/loading, OR we've had controls before (during composition transitions)
  const showControlsPanel = controlsStatus === 'available' || controlsStatus === 'loading' || everHadControls;

  // Resize handlers for the controls panel
  const [isResizing, setIsResizing] = useState(false);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      isDragging.current = true;
      setIsResizing(true);

      const startY = e.clientY;
      const startHeight = panelHeight;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isDragging.current) return;
        moveEvent.preventDefault();

        const delta = startY - moveEvent.clientY;
        const containerHeight = panelRef.current?.parentElement?.clientHeight || 600;
        const maxHeight = Math.max(100, containerHeight - 200);
        const newHeight = Math.max(60, Math.min(maxHeight, startHeight + delta));
        setPanelHeight(newHeight);
      };

      const handleMouseUp = () => {
        isDragging.current = false;
        setIsResizing(false);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [panelHeight]
  );

  // Use component model reference directly to ensure proper memoization
  const baseModel = base?.model;
  const compareModel = compare?.model;

  const BaseLayout = useMemo(() => {
    // Don't render iframe until data is stable and channel is ready
    // Otherwise iframe loads with wrong/missing lcchannel and broadcasts on 'default'
    if (!isStableData || !baseChannelKey || !baseModel) {
      return null;
    }
    if (baseMissing) {
      return (
        <div className={styles.subView}>
          <div className={styles.missingComposition}>
            <div className={styles.missingCompositionTitle}>Composition not available</div>
            <div className={styles.missingCompositionSubtitle}>
              {`The selected composition${requestedCompositionId ? ` "${requestedCompositionId}"` : ''} does not exist for the base version.`}
            </div>
          </div>
        </div>
      );
    }
    const compositionProps = {
      forceHeight: undefined,
      innerBottomPadding: 50,
      ...previewViewProps,
      emptyState,
      component: baseModel,
      queryParams: baseCompQueryParams,
      selected: selectedBaseComp,
    };
    return (
      <div className={styles.subView}>
        <CompositionCompareContext.Provider value={{ compositionProps, isBase: true }}>
          <CompositionContextProvider queryParams={baseCompositionParams} setQueryParams={noop}>
            <PreviewView
              key={`base-${baseIdStr}-${baseCompId}`}
              forceHeight={undefined}
              innerBottomPadding={50}
              {...previewViewProps}
              emptyState={emptyState}
              component={baseModel}
              selected={selectedBaseComp}
              queryParams={baseCompQueryParams}
            />
          </CompositionContextProvider>
        </CompositionCompareContext.Provider>
      </div>
    );
  }, [
    isStableData,
    baseModel,
    baseIdStr,
    baseCompId,
    baseChannelKey,
    selectedBaseComp?.identifier,
    baseCompQueryParams,
    baseCompositionParams,
    previewViewProps,
    emptyState,
    baseMissing,
    requestedCompositionId,
  ]);

  const CompareLayout = useMemo(() => {
    // Don't render iframe until data is stable and channel is ready
    // Otherwise iframe loads with wrong/missing lcchannel and broadcasts on 'default'
    if (!isStableData || !compareChannelKey || !compareModel) {
      return null;
    }
    if (compareMissing) {
      return (
        <div className={styles.subView}>
          <div className={styles.missingComposition}>
            <div className={styles.missingCompositionTitle}>Composition not available</div>
            <div className={styles.missingCompositionSubtitle}>
              {`The selected composition${requestedCompositionId ? ` "${requestedCompositionId}"` : ''} does not exist for the compare version.`}
            </div>
          </div>
        </div>
      );
    }
    const compositionProps = {
      forceHeight: undefined,
      innerBottomPadding: 50,
      ...previewViewProps,
      emptyState,
      component: compareModel,
      queryParams: compareCompQueryParams,
      selected: selectedCompareComp,
    };
    return (
      <div className={styles.subView}>
        <CompositionCompareContext.Provider value={{ compositionProps, isCompare: true }}>
          <CompositionContextProvider queryParams={compareCompositionParams} setQueryParams={noop}>
            <PreviewView
              key={`compare-${compareIdStr}-${compareCompId}`}
              forceHeight={undefined}
              innerBottomPadding={50}
              {...previewViewProps}
              emptyState={emptyState}
              component={compareModel}
              queryParams={compareCompQueryParams}
              selected={selectedCompareComp}
            />
          </CompositionContextProvider>
        </CompositionCompareContext.Provider>
      </div>
    );
  }, [
    isStableData,
    compareModel,
    compareIdStr,
    compareCompId,
    compareChannelKey,
    selectedCompareComp?.identifier,
    compareCompQueryParams,
    compareCompositionParams,
    previewViewProps,
    emptyState,
    compareMissing,
    requestedCompositionId,
  ]);

  const CompositionToolbar = () => {
    if (!base && !compare) {
      return null;
    }

    return (
      <div className={styles.toolbar}>
        <div className={styles.left}>
          <div className={styles.dropdown}>
            {compositionsDropdownSource.length > 0 && (
              <CompositionDropdown dropdownItems={compositionsDropdownSource} selected={selectedCompareDropdown} />
            )}
          </div>
          <div className={styles.widgets}>{Widgets?.Left}</div>
        </div>
        <div className={styles.right}>
          <div className={styles.widgets}>{Widgets?.Right}</div>
        </div>
      </div>
    );
  };

  const key = `${componentCompareContext?.base?.model.id.toString()}-${componentCompareContext?.compare?.model.id.toString()}-composition-compare`;

  return (
    <div key={key} className={classNames(styles.container, { [styles.isResizing]: isResizing })}>
      {componentCompareContext?.loading && (
        <div className={styles.loader}>
          <RoundLoader />
        </div>
      )}
      <CompositionToolbar />
      <div className={styles.compareLayout}>
        <div className={styles.compareMain}>
          <CompareSplitLayoutPreset base={BaseLayout} compare={CompareLayout} />
        </div>
        {showControlsPanel && (
          <div
            ref={panelRef}
            className={styles.controlsPanel}
            style={isControlsOpen ? { height: panelHeight } : undefined}
          >
            <div
              className={styles.controlsResizeHandle}
              onMouseDown={handleResizeStart}
              role="separator"
              aria-orientation="horizontal"
            />
            <div
              className={styles.controlsPanelHeader}
              onClick={() => setControlsOpen((x) => !x)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setControlsOpen((x) => !x);
              }}
              role="button"
              tabIndex={0}
            >
              <Icon of={isControlsOpen ? 'fat-arrow-down' : 'fat-arrow-up'} className={styles.controlsArrow} />
              <span className={styles.controlsPanelTitle}>Live controls</span>
            </div>
            <div className={styles.controlsPanelContent} style={{ display: isControlsOpen ? undefined : 'none' }}>
              <LiveControlsDiffPanel
                resetKey={controlsResetKey}
                baseChannel={baseChannelKey}
                compareChannel={compareChannelKey}
                showEmptyState={false}
                onStatusChange={handleControlsStatusChange}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
