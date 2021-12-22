import { ComponentContext } from '@teambit/component';
import classNames from 'classnames';
import React, { useContext, useState, HTMLAttributes, useMemo } from 'react';
import { flatten } from 'lodash';
import { SplitPane, Pane, Layout } from '@teambit/base-ui.surfaces.split-pane.split-pane';
import { HoverSplitter } from '@teambit/base-ui.surfaces.split-pane.hover-splitter';
import { Collapser } from '@teambit/ui-foundation.ui.buttons.collapser';
import { useCode } from '@teambit/code.ui.queries.get-component-code';
import { getFileIcon, FileIconMatch } from '@teambit/code.ui.utils.get-file-icon';
import { CodeView } from '@teambit/code.ui.code-view';
import { CodeTabTree } from '@teambit/code.ui.code-tab-tree';
import { useCodeParams } from '@teambit/code.ui.hooks.use-code-params';
import { useIsMobile } from '@teambit/ui-foundation.ui.hooks.use-is-mobile';
import styles from './code-stats-tab-page.module.scss';

export function CodeStatsPage() {
  const fileName = useCodeParams();
  const component = useContext(ComponentContext);
  const { mainFile, fileTree = [], dependencies, devFiles } = useCode(component.id);

  const fileFromUrl = useMemo(() => {
    return fileName.file;
  }, [fileName]);

  const currentFile = fileFromUrl || mainFile;
  const isMobile = useIsMobile();
  const [isSidebarOpen, setSidebarOpenness] = useState(!isMobile);
  const sidebarOpenness = isSidebarOpen ? Layout.row : Layout.left;
  console.dir(mainFile, devFiles);

  return (
    <SplitPane layout={sidebarOpenness} size="85%" className={''}>
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
        <CodeTabTree
          currentFile={currentFile}
          dependencies={dependencies}
          fileTree={fileTree}
          devFiles={devFiles}
          mainFile={mainFile}
        />
      </Pane>
    </SplitPane>
  );
}
