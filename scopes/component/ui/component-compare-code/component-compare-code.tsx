import React, { HTMLAttributes, useState } from 'react';
import classNames from 'classnames';
import { HoverSplitter } from '@teambit/base-ui.surfaces.split-pane.hover-splitter';
import { Collapser } from '@teambit/ui-foundation.ui.buttons.collapser';
import { SplitPane, Pane, Layout } from '@teambit/base-ui.surfaces.split-pane.split-pane';
import { useIsMobile } from '@teambit/ui-foundation.ui.hooks.use-is-mobile';
import { FileIconSlot } from '@teambit/code';
import { useComponentCompareContext, useComponentCompareParams } from '@teambit/component.ui.component-compare';
import styles from './component-compare-code.module.scss';
import { ComponentCompareTree } from './component-compare-code-compare-tree';

export type ComponentCompareCodeProps = {
  fileIconSlot?: FileIconSlot;
} & HTMLAttributes<HTMLDivElement>;

export function ComponentCompareCode({ fileIconSlot, className }: ComponentCompareCodeProps) {
  const componentCompareContext = useComponentCompareContext();

  if (!componentCompareContext) return <></>;

  const { base, compare } = componentCompareContext;

  const { selectedFile } = useComponentCompareParams();

  const isMobile = useIsMobile();
  const [isSidebarOpen, setSidebarOpenness] = useState(!isMobile);
  const sidebarOpenness = isSidebarOpen ? Layout.row : Layout.left;

  return (
    <SplitPane
      layout={sidebarOpenness}
      size="85%"
      className={classNames(styles.componentCompareCodeContainer, className)}
    >
      <Pane className={styles.left}></Pane>
      <HoverSplitter className={styles.splitter}>
        <Collapser
          placement="left"
          isOpen={isSidebarOpen}
          onMouseDown={(e) => e.stopPropagation()} // avoid split-pane drag
          onClick={() => setSidebarOpenness((x) => !x)}
          tooltipContent={`${isSidebarOpen ? 'Hide' : 'Show'} file tree`}
          className={styles.collapser}
        />
      </HoverSplitter>
      <Pane className={styles.right}>
        <ComponentCompareTree fileIconSlot={fileIconSlot} base={base} compare={compare} currentFile={selectedFile} />
      </Pane>
    </SplitPane>
  );
}
