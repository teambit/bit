import React, { HTMLAttributes, useState } from 'react';
import classNames from 'classnames';
import { HoverSplitter } from '@teambit/base-ui.surfaces.split-pane.hover-splitter';
import { Collapser } from '@teambit/ui-foundation.ui.buttons.collapser';
import { SplitPane, Pane, Layout } from '@teambit/base-ui.surfaces.split-pane.split-pane';
import { useIsMobile } from '@teambit/ui-foundation.ui.hooks.use-is-mobile';
import { RoundLoader } from '@teambit/design.ui.round-loader';
import { useUpdatedUrlFromQuery } from '@teambit/component.ui.compare';
import { CodeCompareTree } from '@teambit/code.ui.code-compare';
import { ComponentCompareAspectsContext } from './compare-aspects-context';
import { CompareAspectView } from './compare-aspect-view';
import { Widget } from './compare-aspects.widgets';
import { useCompareAspectsQuery } from './use-compare-aspects-query';

import styles from './compare-aspects.module.scss';

export type ComponentCompareAspectsProps = { host: string } & HTMLAttributes<HTMLDivElement>;

export function ComponentCompareAspects({ host, className }: ComponentCompareAspectsProps) {
  const context = useCompareAspectsQuery(host);
  const { loading, selectedBase, selectedCompare, selected, state, hook, aspectNames } = context;

  const isMobile = useIsMobile();
  const [isSidebarOpen, setSidebarOpenness] = useState(!isMobile);
  const sidebarOpenness = isSidebarOpen ? Layout.row : Layout.left;

  const selectedFile = state?.id || selected;

  const _useUpdatedUrlFromQuery = hook?.useUpdatedUrlFromQuery || useUpdatedUrlFromQuery;
  const getHref = (node) => _useUpdatedUrlFromQuery({ aspect: node.id });

  return (
    <ComponentCompareAspectsContext.Provider value={context}>
      <SplitPane
        layout={sidebarOpenness}
        size="85%"
        className={classNames(styles.componentCompareAspectContainer, className)}
      >
        <Pane className={styles.left}>
          {loading && (
            <div className={styles.loader}>
              <RoundLoader />
            </div>
          )}
          {loading || (
            <CompareAspectView
              name={selectedFile}
              baseAspectData={selectedBase}
              compareAspectData={selectedCompare}
              loading={loading}
            />
          )}
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
        <Pane className={classNames(styles.right, styles.dark)}>
          <CodeCompareTree
            fileTree={aspectNames}
            currentFile={selectedFile}
            drawerName={'ASPECTS'}
            widgets={[Widget]}
            getHref={getHref}
            onTreeNodeSelected={hook?.onClick}
          />
        </Pane>
      </SplitPane>
    </ComponentCompareAspectsContext.Provider>
  );
}
