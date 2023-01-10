import React, { HTMLAttributes, useMemo, useRef } from 'react';
import { BlockSkeleton, WordSkeleton } from '@teambit/base-ui.loaders.skeleton';
import { DiffEditor, DiffOnMount } from '@monaco-editor/react';
// import { Toggle } from '@teambit/design.inputs.toggle-switch';
import { H4 } from '@teambit/documenter.ui.heading';

import classNames from 'classnames';
import { darkMode } from '@teambit/base-ui.theme.dark-theme';
import { useFileContent } from '@teambit/code.ui.queries.get-file-content';
import { useComponentCompare } from '@teambit/component.ui.component-compare.context';
import { CollapsibleMenuNav, NavPlugin } from '@teambit/component';

import styles from './code-compare-view.module.scss';

export type CodeCompareViewProps = {
  fileName: string;
  files: string[];
  onTabClicked?: (id: string, event?: React.MouseEvent) => void;
  getHref: (node: { id: string }) => string;
} & HTMLAttributes<HTMLDivElement>;

// a translation list of specific monaco languages that are not the same as their file ending.
const languageOverrides = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mdx: 'markdown',
  md: 'markdown',
};

export function CodeCompareView({ className, fileName, files, onTabClicked, getHref }: CodeCompareViewProps) {
  const componentCompareContext = useComponentCompare();
  const loadingFromContext =
    componentCompareContext?.loading || componentCompareContext?.fileCompareDataByName === undefined;
  const comparingLocalChanges = componentCompareContext?.compare?.hasLocalChanges;

  // const [ignoreWhitespace, setIgnoreWhitespace] = useState(true);
  const monacoRef = useRef<any>();
  // const title = useMemo(() => fileName?.split('/').pop(), [fileName]);

  const language = useMemo(() => {
    if (!fileName) return languageOverrides.ts;
    const fileEnding = fileName?.split('.').pop();
    return languageOverrides[fileEnding || ''] || fileEnding;
  }, [fileName]);

  const codeCompareDataForFile = componentCompareContext?.fileCompareDataByName?.get(fileName);

  /**
   * when comparing with workspace changes, query without id
   */
  const compareId = comparingLocalChanges
    ? componentCompareContext?.compare?.model.id.changeVersion(undefined)
    : componentCompareContext?.compare?.model.id;

  /**
   * when there is no component to compare with, fetch file content
   */
  const { fileContent: downloadedCompareFileContent, loading: loadingDownloadedCompareFileContent } = useFileContent(
    compareId,
    fileName,
    loadingFromContext || !!codeCompareDataForFile?.compareContent
  );
  const { fileContent: downloadedBaseFileContent, loading: loadingDownloadedBaseFileContent } = useFileContent(
    componentCompareContext?.base?.model.id,
    fileName,
    loadingFromContext || !!codeCompareDataForFile?.baseContent
  );

  const loading =
    loadingFromContext ||
    loadingDownloadedCompareFileContent ||
    loadingDownloadedBaseFileContent ||
    componentCompareContext?.loading;

  const originalFileContent = codeCompareDataForFile?.baseContent || downloadedBaseFileContent;

  const modifiedFileContent = codeCompareDataForFile?.compareContent || downloadedCompareFileContent;

  const handleEditorDidMount: DiffOnMount = (_, monaco) => {
    /**
     * disable syntax check
     * ts cant validate all types because imported files aren't available to the editor
     */
    monacoRef.current = monaco;
    if (monacoRef.current) {
      monacoRef.current.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: true,
        noSyntaxValidation: true,
      });
    }
    monaco.editor.defineTheme('bit', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'scrollbar.shadow': '#222222',
      },
    });
    monaco.editor.setTheme('bit');
  };

  /**
   * @todo - redesign this
   */

  // const onIgnoreWhitespaceToggled = () => {
  //   setIgnoreWhitespace((existingState) => !existingState);
  // };

  const originalPath = `${componentCompareContext?.base?.model.id.toString()}-${fileName}`;
  const modifiedPath = `${componentCompareContext?.compare?.model.id.toString()}-${fileName}`;

  const diffEditor = useMemo(
    () => (
      <DiffEditor
        modified={modifiedFileContent}
        original={originalFileContent}
        language={language}
        originalModelPath={originalPath}
        modifiedModelPath={modifiedPath}
        height={'100%'}
        onMount={handleEditorDidMount}
        className={darkMode}
        theme={'vs-dark'}
        options={{
          // ignoreTrimWhitespace: ignoreWhitespace,
          readOnly: true,
          // split or inline
          renderSideBySide: false,
          minimap: { enabled: false },
          scrollbar: { alwaysConsumeMouseWheel: false },
          scrollBeyondLastLine: false,
          folding: false,
          overviewRulerLanes: 0,
          overviewRulerBorder: false,
          wordWrap: 'on',
          wrappingStrategy: 'advanced',
          fixedOverflowWidgets: true,
          renderLineHighlight: 'none',
          lineHeight: 18,
          padding: { top: 8 },
        }}
        loading={<CodeCompareViewLoader />}
      />
    ),
    [modifiedFileContent, originalFileContent]
  );

  return (
    <div
      key={`component-compare-code-view-${fileName}`}
      className={classNames(styles.componentCompareCodeViewContainer, className)}
    >
      {/* <div className={styles.fileName}>
        <H4 size="xs" className={styles.fileName}>
          {loading || <span>{title}</span>}
          {loading && <WordSkeleton className={styles.loader} length={6} />}
        </H4>
      </div> */}

      {/* <div className={styles.ignoreWhitespaceControlContainer}>
        <div className={styles.toggleContainer}>
          <Toggle checked={ignoreWhitespace} onInputChanged={onIgnoreWhitespaceToggled} className={styles.toggle} />
          Ignore Whitespace
        </div>
      </div> */}
      <CodeCompareNav files={files} selectedFile={fileName} onTabClicked={onTabClicked} getHref={getHref} />
      <div className={styles.componentCompareCodeDiffEditorContainer}>
        {loading ? <CodeCompareViewLoader /> : diffEditor}
      </div>
    </div>
  );
}

function CodeCompareViewLoader() {
  return <BlockSkeleton className={styles.loader} lines={36} />;
}

function CodeCompareNav({
  files,
  selectedFile,
  onTabClicked,
  getHref,
}: {
  files: string[];
  selectedFile: string;
  getHref: (node: { id: string }) => string;
  onTabClicked?: (id: string, event?: React.MouseEvent) => void;
}) {
  const extractedTabs: [string, NavPlugin][] = files.map((file) => {
    const isActive = file === selectedFile;
    const href = getHref({ id: file });

    return [
      file,
      {
        props: {
          href,
          displayName: file,
          active: isActive,
          onClick: onTabClicked && ((e) => onTabClicked(file, e)),
          activeClassName: styles.activeNav,
          className: styles.compareNavItem,
          children: file,
          ignoreStickyQueryParams: true,
        },
      },
    ];
  });

  return (
    <div className={styles.navContainer}>
      <CollapsibleMenuNav
        className={styles.compareNav}
        secondaryNavClassName={styles.compareSecondaryNav}
        navPlugins={extractedTabs}
      />
    </div>
  );
}
