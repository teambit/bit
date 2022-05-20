import React, { HTMLAttributes, useState } from 'react';
import classNames from 'classnames';
import { HoverSplitter } from '@teambit/base-ui.surfaces.split-pane.hover-splitter';
import { Collapser } from '@teambit/ui-foundation.ui.buttons.collapser';
import { SplitPane, Pane, Layout } from '@teambit/base-ui.surfaces.split-pane.split-pane';
import { useIsMobile } from '@teambit/ui-foundation.ui.hooks.use-is-mobile';
import { FileIconSlot } from '@teambit/code';
import { useComponentCompareContext, useComponentCompareParams } from '@teambit/component.ui.component-compare';
import { ComponentCompareCodeTree, ComponentCompareCodeView } from '@teambit/component.ui.component-compare-code';
import { useCode } from '@teambit/code.ui.queries.get-component-code';

import styles from './component-compare-code.module.scss';

const DEFAULT_FILE = 'index.ts';

export type ComponentCompareCodeProps = {
  fileIconSlot?: FileIconSlot;
} & HTMLAttributes<HTMLDivElement>;

export function ComponentCompareCode({ fileIconSlot, className }: ComponentCompareCodeProps) {
  const componentCompareContext = useComponentCompareContext();

  const { base, compare } = componentCompareContext || {};

  const isMobile = useIsMobile();
  const [isSidebarOpen, setSidebarOpenness] = useState(!isMobile);
  const sidebarOpenness = isSidebarOpen ? Layout.row : Layout.left;

  const { fileTree: baseFileTree = [], mainFile } = useCode(base?.id);
  const { fileTree: compareFileTree = [] } = useCode(compare?.id);
  const fileTree = baseFileTree.concat(compareFileTree);
  const params = useComponentCompareParams();
  const selectedFile = params?.selectedFile || mainFile || DEFAULT_FILE;

  return (
    <SplitPane
      layout={sidebarOpenness}
      size="85%"
      className={classNames(styles.componentCompareCodeContainer, className)}
    >
      <Pane className={styles.left}>
        <ComponentCompareCodeView base={base} compare={compare} fileName={selectedFile} />
      </Pane>
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
      <Pane className={classNames(styles.right, styles.dark)}>
        <ComponentCompareCodeTree fileIconSlot={fileIconSlot} fileTree={fileTree} currentFile={selectedFile} />
      </Pane>
    </SplitPane>
  );
}
