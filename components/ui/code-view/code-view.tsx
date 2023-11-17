import { H1 } from '@teambit/documenter.ui.heading';
import classNames from 'classnames';
import React, { HTMLAttributes, useMemo } from 'react';
import { CodeSnippet } from '@teambit/documenter.ui.code-snippet';
import { createElement } from 'react-syntax-highlighter';
import { useFileContent } from '@teambit/code.ui.queries.get-file-content';
import SyntaxHighlighter from 'react-syntax-highlighter/dist/esm/prism-light';
import markDownSyntax from 'react-syntax-highlighter/dist/esm/languages/prism/markdown';
import { staticStorageUrl } from '@teambit/base-ui.constants.storage';
import { useLocation } from '@teambit/base-react.navigation.link';
import { ComponentID } from '@teambit/component';
import styles from './code-view.module.scss';

export type CodeViewProps = {
  componentId: ComponentID;
  currentFile?: string;
  currentFileContent?: string;
  icon?: string;
  loading?: boolean;
  codeSnippetClassName?: string;
} & HTMLAttributes<HTMLDivElement>;

SyntaxHighlighter.registerLanguage('md', markDownSyntax);

const extractLineNumber = (hash?: string) => {
  if (!hash) return null;
  const match = hash.match(/#l(\d+)/);
  return match ? parseInt(match[1], 10) : null;
};

const extractSearchKeyword = (hash?: string) => {
  if (!hash) return null;
  const match = hash.match(/#search=(.*)/);
  return match ? decodeURIComponent(match[1]) : null;
};

export function CodeView({
  className,
  componentId,
  currentFile,
  icon,
  currentFileContent,
  codeSnippetClassName,
  loading: loadingFromProps,
}: CodeViewProps) {
  const { fileContent: downloadedFileContent, loading: loadingFileContent } = useFileContent(
    componentId,
    currentFile,
    !!currentFileContent
  );
  const loading = loadingFromProps || loadingFileContent;
  const location = useLocation();
  const highlightedLineRef = React.useRef<HTMLDivElement>(null);
  const fileContent = currentFileContent || downloadedFileContent;
  const title = useMemo(() => currentFile?.split('/').pop(), [currentFile]);
  const lang = useMemo(() => {
    const langFromFileEnding = currentFile?.split('.').pop();

    // for some reason, SyntaxHighlighter doesnt support scss or sass highlighting, only css. I need to check how to fix this properly
    if (langFromFileEnding === 'scss' || langFromFileEnding === 'sass') return 'css';
    if (langFromFileEnding === 'mdx') return 'md';
    return langFromFileEnding;
  }, [fileContent]);

  if (!fileContent && !loading && currentFile) return <EmptyCodeView />;

  const lineNumber = extractLineNumber(location?.hash);
  const searchKeyword = extractSearchKeyword(location?.hash);

  React.useEffect(() => {
    if (highlightedLineRef?.current && (lineNumber || searchKeyword)) {
      highlightedLineRef?.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [lineNumber, searchKeyword, highlightedLineRef?.current]);

  const customRenderer = React.useCallback(
    ({ rows, stylesheet, useInlineStyles }) => {
      let isKeywordHighlighted = false;

      return rows.map((node, index) => {
        const lineText = node.children
          .map((child) => child.children?.[0]?.value ?? '')
          .join('')
          .trim();
        const lineNum = index + 1;
        const matchesSearchWord = !isKeywordHighlighted && searchKeyword && lineText.includes(searchKeyword);
        const isHighlighted = lineNum === lineNumber || matchesSearchWord;

        if (isHighlighted) isKeywordHighlighted = true; // Ensure only the first match is highlighted

        return (
          <div
            ref={isHighlighted ? highlightedLineRef : null}
            key={index}
            className={classNames(isHighlighted && styles.customRow)}
          >
            {createElement({
              key: index,
              node,
              stylesheet,
              useInlineStyles,
            })}
          </div>
        );
      });
    },
    [lineNumber]
  );

  return (
    <div className={classNames(styles.codeView, className)}>
      <H1 size="sm" className={styles.fileName}>
        {currentFile && <img className={styles.img} src={icon} />}
        <span>{title}</span>
      </H1>
      <CodeSnippet
        className={styles.codeSnippetWrapper}
        frameClass={classNames(styles.codeSnippet, codeSnippetClassName)}
        showLineNumbers
        language={lang}
        renderer={customRenderer}
      >
        {fileContent || ''}
      </CodeSnippet>
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
