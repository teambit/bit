import { ComponentContext } from '@teambit/component';
import { H1 } from '@teambit/documenter.ui.heading';
import classNames from 'classnames';
import React, { useContext, useState, HTMLAttributes, useMemo } from 'react';
import { getIconForFile } from 'vscode-icons-js';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
// import { SplitPane, Pane, Layout } from '@teambit/bla.split-pane';
import { SplitPane, Pane, Layout } from '@teambit/base-ui.surfaces.split-pane.split-pane';
import { HoverSplitter } from '@teambit/base-ui.surfaces.split-pane.hover-splitter';
import { Collapser } from '@teambit/ui.side-bar';
import { useLocation } from '@teambit/ui.routing.provider';
import { CodeSnippet } from '@teambit/documenter.ui.code-snippet';
import { useCode, useFileContent } from '../queries/get-component-code';
import styles from './code-tab-page.module.scss';
import { CodeTabTree } from './code-tab-tree';

type CodePageProps = {} & HTMLAttributes<HTMLDivElement>;

export function CodePage({ className }: CodePageProps) {
  const component = useContext(ComponentContext);
  const location = useLocation();
  const { mainFile, fileTree = [], dependencies = {}, devFiles } = useCode(component.id);
  const currentFile = useMemo(() => (location.hash || mainFile)?.replace('#', '') || '', [location.hash, mainFile]); // because hash returns with # and mainFile without
  const fileContent = useFileContent(component.id, currentFile);

  const [isSidebarOpen, setSidebarOpenness] = useState(true);
  const sidebarOpenness = isSidebarOpen ? Layout.row : Layout.left;

  return (
    <ThemeContext>
      <SplitPane layout={sidebarOpenness} size="85%" className={classNames(styles.codePage, className)}>
        <Pane className={styles.left}>
          <div className={styles.codeView}>
            <H1 size="sm" className={styles.fileName}>
              {currentFile && <img className={styles.img} src={getIcon(currentFile)} />}
              <span>{currentFile?.split('/').pop()}</span>
            </H1>
            <CodeSnippet
              className={styles.codeSnippetWrapper}
              frameClass={styles.codeSnippet}
              showLineNumbers
              language={currentFile?.split('.').pop()}
            >
              {fileContent || ''}
            </CodeSnippet>
          </div>
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
          <CodeTabTree currentFile={currentFile} dependencies={dependencies} fileTree={fileTree} devFiles={devFiles} />
        </Pane>
      </SplitPane>
    </ThemeContext>
  );
}

function getIcon(fileName?: string) {
  if (!fileName) return '';
  const iconName = getIconForFile(fileName);
  const storageLink = 'https://static.bit.dev/file-icons/';
  return `${storageLink}${iconName}`;
}
