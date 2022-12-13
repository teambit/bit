import React, { HTMLAttributes, useState } from 'react';
import classNames from 'classnames';
import { HoverSplitter } from '@teambit/base-ui.surfaces.split-pane.hover-splitter';
import { Collapser } from '@teambit/ui-foundation.ui.buttons.collapser';
import { SplitPane, Pane, Layout } from '@teambit/base-ui.surfaces.split-pane.split-pane';
import { useIsMobile } from '@teambit/ui-foundation.ui.hooks.use-is-mobile';
import { CodeCompareTree } from '@teambit/code.ui.code-compare';
import { useUpdatedUrlFromQuery } from '@teambit/component.ui.component-compare.hooks.use-component-compare-url';
import { ComponentCompareAspectsContext } from '@teambit/component.ui.component-compare.compare-aspects.context';
import { useCompareAspectsQuery } from '@teambit/component.ui.component-compare.compare-aspects.hooks.use-compare-aspects';
import { CompareAspectView } from '@teambit/component.ui.component-compare.compare-aspects.compare-aspect-view';

import { Widget } from './compare-aspects.widgets';

import styles from './compare-aspects.module.scss';

export type ComponentCompareAspectsProps = { host: string } & HTMLAttributes<HTMLDivElement>;

export function ComponentCompareAspects({ host, className }: ComponentCompareAspectsProps) {
  const context = useCompareAspectsQuery(host);
  const { loading, selectedBase, selectedCompare, selected, hook, aspectNames } = context;
  const isMobile = useIsMobile();
  const [isSidebarOpen, setSidebarOpenness] = useState(!isMobile);
  const sidebarOpenness = isSidebarOpen ? Layout.row : Layout.left;

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
        <Pane className={classNames(styles.right, styles.dark)}>
          <CodeCompareTree
            fileTree={aspectNames}
            currentFile={selected}
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
