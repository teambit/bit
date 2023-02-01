import React, { HTMLAttributes, useMemo, ComponentType } from 'react';
import classNames from 'classnames';
import { useFileContent } from '@teambit/code.ui.queries.get-file-content';
import SyntaxHighlighter from 'react-syntax-highlighter/dist/esm/prism-light';
import markDownSyntax from 'react-syntax-highlighter/dist/esm/languages/prism/markdown';
import { staticStorageUrl } from '@teambit/base-ui.constants.storage';
import { ComponentID } from '@teambit/component';
import { CodeEditor } from '@teambit/code.ui.code-editor';
import { CodeNavigation } from '@teambit/code.ui.code-navigation';
import { LineSkeleton } from '@teambit/base-ui.loaders.skeleton';
import { WidgetProps } from '@teambit/ui-foundation.ui.tree.tree-node';
import { FileIconMatch } from '@teambit/code.ui.utils.get-file-icon';

import styles from './code-view.module.scss';

export type CodeViewProps = {
  componentId: ComponentID;
  currentFile: string;
  currentFileContent?: string;
  fileIconMatchers: FileIconMatch[];
  files: string[];
  getHref: (node: { id: string }) => string;
  widgets?: ComponentType<WidgetProps<any>>[];
  onTabClicked?: (id: string, event?: React.MouseEvent) => void;
} & HTMLAttributes<HTMLDivElement>;

SyntaxHighlighter.registerLanguage('md', markDownSyntax);
// a translation list of specific monaco languages that are not the same as their file ending.
const languageOverrides = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mdx: 'markdown',
  md: 'markdown',
};

export function CodeView({
  className,
  componentId,
  currentFile,
  files,
  currentFileContent,
  fileIconMatchers,
  widgets,
  onTabClicked,
  getHref,
}: CodeViewProps) {
  const { fileContent: downloadedFileContent, loading } = useFileContent(
    componentId,
    currentFile,
    !!currentFileContent
  );
  const fileContent = currentFileContent || downloadedFileContent;
  const language = useMemo(() => {
    if (!currentFile) return languageOverrides.ts;
    const fileEnding = currentFile?.split('.').pop();
    return languageOverrides[fileEnding || ''] || fileEnding;
  }, [currentFile]);

  if (!fileContent && !loading && currentFile) return <EmptyCodeView />;

  return (
    <div className={classNames(styles.codeView, className)}>
      <CodeNavigation
        files={files}
        selectedFile={currentFile}
        fileIconMatchers={fileIconMatchers}
        onTabClicked={onTabClicked}
        widgets={widgets}
        getHref={getHref}
      />
      {currentFile && (
        <div className={classNames(styles.codeViewContainer, loading && styles.loading)}>
          <CodeEditor
            path={currentFile}
            Loader={<LineSkeleton className={styles.loader} count={50} />}
            fileContent={fileContent || ''}
            language={language}
          />
        </div>
      )}
    </div>
  );
}

function EmptyCodeView() {
  return (
    <div className={styles.emptyCodeView}>
      <img src={`${staticStorageUrl}/harmony/empty-code-view.svg`} />
      <div>Nothing to show</div>
    </div>
  );
}

export function CodeViewLoader() {
  return <LineSkeleton className={styles.loader} count={50} />;
}
