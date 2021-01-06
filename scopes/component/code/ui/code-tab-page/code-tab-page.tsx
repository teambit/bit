import { ComponentContext } from '@teambit/component';
import classNames from 'classnames';
import React, { useContext, useState, HTMLAttributes, useMemo } from 'react';
import { flatten } from 'lodash';
import { SplitPane, Pane, Layout } from '@teambit/base-ui.surfaces.split-pane.split-pane';
import { HoverSplitter } from '@teambit/base-ui.surfaces.split-pane.hover-splitter';
import { Collapser } from '@teambit/ui.side-bar';
import { useLocation } from '@teambit/ui.routing.provider';
import { useCode } from '@teambit/ui.queries.get-component-code';
import { getFileIcon, FileIconMatch } from '@teambit/code.utils.get-file-icon';
import type { FileIconSlot } from '@teambit/code';
import styles from './code-tab-page.module.scss';
import { CodeTabTree } from '../code-tab-tree';
import { CodeView } from '../code-view';

type CodePageProps = {
  fileIconSlot?: FileIconSlot;
} & HTMLAttributes<HTMLDivElement>;

// should we move this file to code-tab-page folder?

export function CodePage({ className, fileIconSlot }: CodePageProps) {
  const component = useContext(ComponentContext);
  const { mainFile, fileTree = [], dependencies, devFiles } = useCode(component.id);
  const location = useLocation();
  const fileFromHash = useMemo(() => location.hash.replace('#', ''), [location.hash]);
  const currentFile = fileFromHash || mainFile;

  const [isSidebarOpen, setSidebarOpenness] = useState(true);
  const sidebarOpenness = isSidebarOpen ? Layout.row : Layout.left;
  const fileIconMatchers: FileIconMatch[] = useMemo(() => flatten(fileIconSlot?.values()), [fileIconSlot]);
  const icon = getFileIcon(fileIconMatchers, currentFile);

  return (
    <SplitPane layout={sidebarOpenness} size="85%" className={classNames(styles.codePage, className)}>
      <Pane className={styles.left}>
        <CodeView componentId={component.id} currentFile={currentFile} icon={icon} />
      </Pane>
      <HoverSplitter className={styles.splitter}>
        <Collapser
          id="CodeTabCollapser"
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
          fileIconMatchers={fileIconMatchers}
        />
      </Pane>
    </SplitPane>
  );
}
