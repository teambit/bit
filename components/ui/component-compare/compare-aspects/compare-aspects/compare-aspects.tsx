import React, { useState } from 'react';
import type { HTMLAttributes } from 'react';
import classNames from 'classnames';
import { HoverSplitter } from '@teambit/base-ui.surfaces.split-pane.hover-splitter';
import { Collapser } from '@teambit/ui-foundation.ui.buttons.collapser';
import { SplitPane, Pane, Layout } from '@teambit/base-ui.surfaces.split-pane.split-pane';
import { useIsMobile } from '@teambit/ui-foundation.ui.hooks.use-is-mobile';
import { CodeCompareTree } from '@teambit/code.ui.code-compare';
import { useUpdatedUrlFromQuery } from '@teambit/component.ui.component-compare.hooks.use-component-compare-url';
import { useLocation } from '@teambit/base-react.navigation.link';
import { useQuery } from '@teambit/ui-foundation.ui.react-router.use-query';
import { ComponentCompareAspectsContext } from '@teambit/component.ui.component-compare.compare-aspects.context';
import { useCompareAspectsQuery } from '@teambit/component.ui.component-compare.compare-aspects.hooks.use-compare-aspects';
import { CompareAspectView } from '@teambit/component.ui.component-compare.compare-aspects.compare-aspect-view';

import { Widget } from './compare-aspects.widgets';

import styles from './compare-aspects.module.scss';

export type ComponentCompareAspectsProps = { host: string } & HTMLAttributes<HTMLDivElement>;

/** Legacy aspects route retained on the shared Shiki diff renderer for backwards-compatible URLs. */
export function ComponentCompareAspects({ host, className }: ComponentCompareAspectsProps) {
  const context = useCompareAspectsQuery(host);
  const { loading, selectedBase, selectedCompare, selected, hook, aspectNames, state } = context;
  const isMobile = useIsMobile();
  const [isSidebarOpen, setSidebarOpenness] = useState(!isMobile);
  const sidebarOpenness = isSidebarOpen ? Layout.row : Layout.left;
  const controlledHref = useUpdatedUrlFromQuery({});
  const query = useQuery();
  const location = useLocation() || { pathname: '/' };
  const getUpdatedUrlFromQuery = hook?.useUpdatedUrlFromQuery ?? useUpdatedUrlFromQuery;

  const useHref = (node) => {
    const href = getUpdatedUrlFromQuery(
      { aspect: node.id },
      () => query,
      () => location
    );
    return state?.controlled ? controlledHref : href;
  };

  return (
    // No theme override: the view inherits the page theme. It used to force DarkTheme, from when Monaco
    // rendered these diffs and its editor was always dark; the Shiki DiffViewer paints with theme tokens.
    <div className={classNames(styles.themeContainer, className)}>
      <ComponentCompareAspectsContext.Provider value={context}>
        <SplitPane
          layout={sidebarOpenness}
          size="85%"
          className={classNames(styles.componentCompareAspectContainer, className)}
        >
          <Pane className={styles.left}>
            <CompareAspectView
              name={selected}
              baseAspectData={selectedBase}
              compareAspectData={selectedCompare}
              loading={loading}
            />
          </Pane>
          <HoverSplitter className={styles.splitter}>
            <Collapser
              placement="left"
              isOpen={isSidebarOpen}
              onMouseDown={(e) => e.stopPropagation()} // avoid split-pane drag
              onClick={() => setSidebarOpenness((x) => !x)}
              tooltipContent={`${isSidebarOpen ? 'Hide' : 'Show'} aspects tree`}
              className={styles.collapser}
            />
          </HoverSplitter>
          <Pane className={styles.right}>
            <CodeCompareTree
              fileTree={aspectNames}
              currentFile={selected}
              drawerName={'ASPECTS'}
              widgets={[Widget]}
              getHref={useHref}
              onTreeNodeSelected={hook?.onClick}
              open={isSidebarOpen}
            />
          </Pane>
        </SplitPane>
      </ComponentCompareAspectsContext.Provider>
    </div>
  );
}
