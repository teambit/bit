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
  host?: string;
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

function joinPaths(base: string, relative: string) {
  // Ensure we start with a base directory path
  const baseParts = base.endsWith('/') ? base.split('/') : base.split('/').slice(0, -1);
  const relativeParts = relative.split('/');

  for (const part of relativeParts) {
    if (part === '.' || part === '') {
      // No operation needed for current directory marker or empty parts.
    } else if (part === '..') {
      // Navigate up one directory level
      baseParts.pop();
    } else {
      // Navigate into a new directory level
      baseParts.push(part);
    }
  }

  // Reconstruct the path from the parts
  // Also, prevent creating a leading '/' to keep the path relative to the base
  const newPath = baseParts.join('/');
  return newPath.startsWith('/') ? newPath : `/${newPath}`;
}

function useInViewport(ref: React.RefObject<HTMLElement>) {
  const [isInViewport, setIsInViewport] = React.useState(false);

  React.useEffect(() => {
    if (!ref.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInViewport(entry.isIntersecting);
      },
      {
        root: null,
        threshold: 0.1,
      }
    );

    observer.observe(ref.current);

    return () => {
      if (ref.current) {
        observer.unobserve(ref.current);
      }
    };
  }, [ref]);

  return isInViewport;
}

export function CodeView({
  className,
  componentId,
  currentFile,
  icon,
  currentFileContent,
  codeSnippetClassName,
  loading: loadingFromProps,
  dependencies,
  host = 'teambit.scope/scope',
}: CodeViewProps) {
  const depsByPackageName = new Map<string, DependencyType>(
    (dependencies || []).map((dep) => [(dep.packageName || dep.id).toString(), dep])
  );
  const coreAspects = useCoreAspects() ?? {};
  const { fileContent: downloadedFileContent, loading: loadingFileContent } = useFileContent(
    componentId,
    currentFile,
    !!currentFileContent,
    host
  );
  const loading = loadingFromProps || loadingFileContent;
  const location = useLocation();
  const navigate = useNavigate();
  const [isHighlightedState, setIsHighlightedState] = React.useState(false);
  const highlightedLineRef = React.useRef<HTMLDivElement>(null);
  const isInViewport = useInViewport(highlightedLineRef);

  const fileContent = currentFileContent || downloadedFileContent;
  const title = useMemo(() => currentFile?.split('/').pop(), [currentFile]);
  const lang = useMemo(() => {
    const langFromFileEnding = currentFile?.split('.').pop();

    // for some reason, SyntaxHighlighter doesnt support scss or sass highlighting, only css. I need to check how to fix this properly
    if (langFromFileEnding === 'scss' || langFromFileEnding === 'sass') return 'css';
    if (langFromFileEnding === 'mdx') return 'md';
    if (langFromFileEnding === 'vue') return 'html';
    if (langFromFileEnding === 'cjs' || langFromFileEnding === 'mjs') return 'js';
    if (langFromFileEnding === 'cts' || langFromFileEnding === 'mts') return 'ts';

    return langFromFileEnding;
  }, [fileContent]);

  const lineNumber = extractLineNumber(location?.hash);
  const searchKeyword = extractSearchKeyword(location?.hash);
  const lineRange = extractLineRange(location?.hash);

  React.useLayoutEffect(() => {
    if (highlightedLineRef?.current && isHighlightedState && !isInViewport) {
      highlightedLineRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isHighlightedState, isInViewport]);

  const onLineClicked = React.useCallback(
    (_lineNumber: number) => () => {
      // setScrollBlock('nearest');
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
      let refAssigned = false;

      return rows.map((node, index) => {
        const lineText = node.children
          .map((child) => child.children?.[0]?.value ?? '')
          .join('')
          .trim();

        node.children.forEach((child) => {
          if (child.properties?.className?.includes('string') && child.children[0]?.value?.length > 3) {
            const packageNameOrPath = child.children[0].value.replace(/['"]/g, '');
            const dep = depsByPackageName.get(packageNameOrPath);
            const isRelativePath = packageNameOrPath.startsWith('.');
            const filePath = isRelativePath && currentFile ? joinPaths(currentFile, packageNameOrPath) : undefined;
            if (filePath) {
              child.properties = {
                ...child.properties,
                onClick: (e) => {
                  e.stopPropagation();
                  navigate(`${filePath.substring(1)}${location?.search}`);
                },
                style: { cursor: 'pointer', textDecoration: 'underline' },
              };
            }

            if (dep || coreAspects[packageNameOrPath]) {
              const id = dep
                ? (dep?.__typename === 'ComponentDependency' && ComponentID.fromString(dep.id)) || undefined
                : ComponentID.fromString(coreAspects[packageNameOrPath]);
              const compUrl = id && ComponentUrl.toUrl(id, { includeVersion: true });
              const [compIdUrl, version] = compUrl ? compUrl.split('?') : [undefined, undefined];
              const link = compIdUrl
                ? `${compIdUrl}/~code?${version}`
                : `https://www.npmjs.com/package/${packageNameOrPath}`;

              child.tagName = 'a';
              child.properties = { ...child.properties, href: link, target: '_blank', rel: 'noopener noreferrer' };
            }
          }
        });

        const lineNum = index + 1;
        const matchesSearchWord = !isKeywordHighlighted && searchKeyword && lineText.includes(searchKeyword);
        const isInRange = lineRange && lineNum >= lineRange.start && lineNum <= lineRange.end;
        const isHighlighted = lineNum === lineNumber || matchesSearchWord || isInRange;
        if (isHighlighted && searchKeyword) isKeywordHighlighted = true;

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

        const highlightedRef = !refAssigned && isHighlighted ? ((refAssigned = true), highlightedLineRef) : null;

        if (isHighlighted && !isHighlightedState && highlightedRef) {
          setIsHighlightedState(true);
        }

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
    [
      onLineClicked,
      searchKeyword,
      lineNumber,
      lineRange,
      coreAspects,
      depsByPackageName.size,
      currentFile,
      isHighlightedState,
    ]
  );

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

  if (!fileContent && !loading && currentFile) return <EmptyCodeView />;

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
