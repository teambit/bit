import { ComponentContext } from '@teambit/component';
import { H1 } from '@teambit/documenter.ui.heading';
// import { Separator } from '@teambit/documenter.ui.separator';
// import { VersionBlock } from '@teambit/ui.version-block';
// import { EmptyBox } from '@teambit/ui.empty-box';
import classNames from 'classnames';
// import React, { HTMLAttributes, useContext } from 'react';
import React, { useContext, useState, useCallback, useMemo, HTMLAttributes } from 'react';
import { getIconForFile } from 'vscode-icons-js';
import { FileTree } from '@teambit/tree.file-tree';
import { DrawerUI } from '@teambit/tree.drawer';
import { TreeNode as Node } from '@teambit/tree.tree-node';

import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { SplitPane, Pane, Layout } from '@teambit/base-ui.surfaces.split-pane.split-pane';
import { HoverSplitter } from '@teambit/base-ui.surfaces.split-pane.hover-splitter';
// import { PropTable } from '@teambit/documenter.ui.property-table';
// import { Tab, TabContainer, TabList, TabPanel } from '@teambit/panels';
// import { useDocs } from '@teambit/ui.queries.get-docs';
import { Collapser } from '@teambit/ui.side-bar';
import { FolderTreeNode } from '@teambit/tree.folder-tree-node';
// import head from 'lodash.head';
import { useLocation } from '@teambit/ui.routing.provider';
import { CodeSnippet } from '@teambit/documenter.ui.code-snippet';
// import { CodeSnippet } from '../../../../../react-new-project/components/code-snippet';
import { useCode } from '../queries/get-component-code';
import styles from './code-tab-page.module.scss';
// import { Composition } from './composition';

// import { ComponentComposition } from './ui';
// import { CompositionsPanel } from './ui/compositions-panel/compositions-panel';

// const bla = 'https://static.bit.dev/file-icons/';

type CodePageProps = {} & HTMLAttributes<HTMLDivElement>;

export function CodePage({ className }: CodePageProps) {
  const component = useContext(ComponentContext);
  const location = useLocation();
  const files = useCode(component.id, location.hash);
  console.log('compo', component, files, location);

  const currentFile = location.hash.split('#')[1] || files.mainFile;

  const [isSidebarOpen, setSidebarOpenness] = useState(true);
  const [isFileListOpen, setFileListOpenness] = useState(true);
  const sidebarOpenness = isSidebarOpen ? Layout.row : Layout.left;
  // collapse sidebar when empty, reopen when not
  // useEffect(() => setSidebarOpenness(component.compositions.length > 0), [component.compositions.length]);

  const TreeNodeRenderer = useCallback(
    function TreeNode(props: any) {
      const children = props.node.children;

      if (!children) return <Node {...props} isActive={props.node.id === currentFile} icon={getIcon(props.node.id)} />;

      return <FolderTreeNode {...props} />;
    },
    [currentFile]
  );

  const drawer = useMemo(() => {
    const Tree = () => <FileTree TreeNode={TreeNodeRenderer} files={files.fileTree || ['']} />;
    return {
      name: 'FILES',
      render: Tree,
    };
  }, [files.fileTree]);

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
              {files?.getFile || ''}
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
          <DrawerUI isOpen={isFileListOpen} onToggle={() => setFileListOpenness(!isFileListOpen)} drawer={drawer} />
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
