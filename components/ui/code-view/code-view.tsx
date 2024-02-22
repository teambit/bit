import { H1 } from '@teambit/documenter.ui.heading';
import classNames from 'classnames';
import React, { HTMLAttributes, useMemo } from 'react';
import { CodeSnippet } from '@teambit/documenter.ui.code-snippet';
import { createElement } from 'react-syntax-highlighter';
import { useFileContent } from '@teambit/code.ui.queries.get-file-content';
import SyntaxHighlighter from 'react-syntax-highlighter/dist/esm/prism-light';
import markDownSyntax from 'react-syntax-highlighter/dist/esm/languages/prism/markdown';
import { staticStorageUrl } from '@teambit/base-ui.constants.storage';
import { useLocation, useNavigate } from '@teambit/base-react.navigation.link';
import { ComponentUrl } from '@teambit/component.modules.component-url';
import { DependencyType } from '@teambit/code.ui.queries.get-component-code';
import { ComponentID } from '@teambit/component';
import { useCoreAspects } from '@teambit/harmony.ui.hooks.use-core-aspects';
import styles from './code-view.module.scss';

export type CodeViewProps = {
  componentId: ComponentID;
  currentFile?: string;
  currentFileContent?: string;
  icon?: string;
  loading?: boolean;
  codeSnippetClassName?: string;
  dependencies?: DependencyType[];
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

const extractLineRange = (hash) => {
  if (!hash) return null;

  // Regex to match the range pattern (e.g., #l5-10)
  const match = hash.match(/#l(\d+)-(\d+)/);
  if (match && match.length === 3) {
    const start = parseInt(match[1], 10);
    const end = parseInt(match[2], 10);
    return { start, end };
  }

  return null;
};

export function CodeView({
  className,
  componentId,
  currentFile,
  icon,
  currentFileContent,
  codeSnippetClassName,
  loading: loadingFromProps,
  dependencies,
}: CodeViewProps) {
  const depsByPackageName = new Map<string, DependencyType>(
    (dependencies || []).map((dep) => [(dep.packageName || dep.id).toString(), dep])
  );
  const coreAspects = useCoreAspects();
  const { fileContent: downloadedFileContent, loading: loadingFileContent } = useFileContent(
    componentId,
    currentFile,
    !!currentFileContent
  );
  const loading = loadingFromProps || loadingFileContent;
  const location = useLocation();
  const navigate = useNavigate();
  const [scrollBlock, setScrollBlock] = React.useState<'nearest' | 'center'>('center');
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

  const lineNumber = extractLineNumber(location?.hash);
  const searchKeyword = extractSearchKeyword(location?.hash);
  const lineRange = extractLineRange(location?.hash);

  React.useEffect(() => {
    if (highlightedLineRef?.current) {
      highlightedLineRef?.current.scrollIntoView({ behavior: 'smooth', block: scrollBlock });
    }
  }, [highlightedLineRef?.current, scrollBlock]);

  const onLineClicked = React.useCallback(
    (_lineNumber: number) => () => {
      setScrollBlock('nearest');
      // If the line number is already highlighted, remove the hash
      if (
        lineNumber === _lineNumber ||
        (lineRange && _lineNumber >= lineRange?.start && _lineNumber <= lineRange?.end)
      ) {
        navigate(`${location?.pathname}${location?.search}`, { replace: true });
      } else {
        navigate(`${location?.pathname}${location?.search}#l${_lineNumber}`, { replace: true });
      }
    },
    [lineNumber, lineRange, location?.pathname, location?.search]
  );

  const customRenderer = React.useCallback(
    ({ rows, stylesheet, useInlineStyles }) => {
      let isKeywordHighlighted = false;

      return rows.map((node, index) => {
        // console.log('🚀 ~ returnrows.map ~ node:', node);
        const lineText = node.children
          .map((child) => child.children?.[0]?.value ?? '')
          .join('')
          .trim();

        const lineNum = index + 1;
        const matchesSearchWord = !isKeywordHighlighted && searchKeyword && lineText.includes(searchKeyword);
        const isInRange = lineRange && lineNum >= lineRange.start && lineNum <= lineRange.end;
        const isHighlighted = lineNum === lineNumber || matchesSearchWord || isInRange;

        if (isHighlighted && searchKeyword) isKeywordHighlighted = true;
        node.children.forEach((child) => {
          if (child.properties?.className?.includes('string')) {
            const packageNameOrPath = child.children[0].value.replace(/['"]/g, '');
            const dep = depsByPackageName.get(packageNameOrPath);
            if (dep || coreAspects[packageNameOrPath]) {
              const id = dep
                ? (dep?.__typename === 'ComponentDependency' && ComponentID.fromString(dep.id)) || undefined
                : ComponentID.fromString(coreAspects[packageNameOrPath]);
              const link = id
                ? ComponentUrl.toUrl(id, {
                    includeVersion: true,
                  })
                : `https://www.npmjs.com/package/${packageNameOrPath}`;
              child.tagName = 'a';
              child.properties = { ...child.properties, href: link, target: '_blank' };
            }
          }
        });

        let lineNumberNode;
        if (node.children.length > 0 && node.children[0].properties.className.includes('linenumber')) {
          lineNumberNode = node.children[0];
          node = {
            ...node,
            children: node.children.slice(1),
          };
        }

        const lineNumberElement =
          lineNumberNode &&
          createElement({
            node: lineNumberNode,
            stylesheet,
            useInlineStyles,
            key: `line-number-${index}`,
          });

        const highlightedRef = !isInRange
          ? (isHighlighted && highlightedLineRef) || null
          : (lineNum === lineRange.start && highlightedLineRef) || null;

        return (
          <div
            ref={highlightedRef}
            key={index}
            className={classNames(isHighlighted && styles.highlightedRow, styles.customRow)}
            onClick={onLineClicked(lineNum)}
          >
            {lineNumberElement}
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
    [onLineClicked, searchKeyword, lineNumber, lineRange, coreAspects, depsByPackageName.size]
  );

  if (!fileContent && !loading && currentFile) return <EmptyCodeView />;

  const getSelectedLineRange = () => {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return null;

    const startNode = selection.getRangeAt(0).startContainer;
    const endNode = selection.getRangeAt(0).endContainer;

    // Traverse up to find the parent divs that contain the line numbers
    const findLineNumberElement = (node) => {
      while (node && node.nodeName !== 'DIV') {
        node = node.parentNode;
      }
      return node.querySelector('.linenumber');
    };

    const startLineNumberElement = findLineNumberElement(startNode);
    const endLineNumberElement = findLineNumberElement(endNode);

    const startLineNumber = startLineNumberElement ? parseInt(startLineNumberElement.textContent, 10) : null;
    const endLineNumber = endLineNumberElement ? parseInt(endLineNumberElement.textContent, 10) : null;

    return startLineNumber && endLineNumber ? { start: startLineNumber, end: endLineNumber } : null;
  };

  const handleMouseUp = React.useCallback(() => {
    const selectedRange = getSelectedLineRange();
    if (!selectedRange || selectedRange.end === selectedRange.start) return;
    navigate(`${location?.pathname}${location?.search}#l${selectedRange.start}-${selectedRange.end}`, {
      replace: true,
    });
  }, [location?.pathname, location?.search]);

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
        showInlineLineNumbers={true}
        onMouseUp={handleMouseUp}
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
