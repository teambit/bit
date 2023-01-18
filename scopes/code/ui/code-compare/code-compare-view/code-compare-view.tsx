import { DiffEditor, DiffOnMount } from '@monaco-editor/react';
import { LineSkeleton } from '@teambit/base-ui.loaders.skeleton';
import { darkMode } from '@teambit/base-ui.theme.dark-theme';
import { FileIconSlot } from '@teambit/code';
import { ReviewComment, ReviewManager } from '@teambit/code.ui.code-compare-review';
import { useFileContent } from '@teambit/code.ui.queries.get-file-content';
import { FileIconMatch, getFileIcon } from '@teambit/code.ui.utils.get-file-icon';
import { CollapsibleMenuNav, NavPlugin } from '@teambit/component';
import { useComponentCompare } from '@teambit/component.ui.component-compare.context';
import { CheckboxItem } from '@teambit/design.inputs.selectors.checkbox-item';
import { Radio } from '@teambit/design.ui.input.radio';
import { Dropdown } from '@teambit/evangelist.surfaces.dropdown';
import { WidgetProps } from '@teambit/ui-foundation.ui.tree.tree-node';
import classNames from 'classnames';
import flatten from 'lodash.flatten';
import * as Monaco from 'monaco-editor/esm/vs/editor/editor.api';
import React, { ComponentType, HTMLAttributes, useEffect, useMemo, useRef, useState } from 'react';
import styles from './code-compare-view.module.scss';

export type CodeCompareViewProps = {
  fileName: string;
  files: string[];
  onTabClicked?: (id: string, event?: React.MouseEvent) => void;
  getHref: (node: { id: string }) => string;
  fileIconSlot?: FileIconSlot;
  widgets?: ComponentType<WidgetProps<any>>[];
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

type CodeCompareView = 'split' | 'inline';
const COMMENTS: ReviewComment[] = [
  {
    id: '1',
    lineNumber: 2,
  },
  {
    id: '11',
    lineNumber: 3,
  },
  {
    id: '11',
    lineNumber: 13,
  },
  {
    id: '11',
    lineNumber: 8,
  },
  {
    id: '11',
    lineNumber: 9,
  },
  {
    id: '11',
    lineNumber: 23,
  },
  {
    id: '111',
    lineNumber: 1,
    selection: {
      startLineNumber: 1,
      endLineNumber: 1,
      startColumn: 2,
      endColumn: 5,
    },
  },
];
export function CodeCompareView({
  className,
  fileName,
  files,
  onTabClicked,
  getHref,
  fileIconSlot,
  widgets,
}: CodeCompareViewProps) {
  const fileIconMatchers: FileIconMatch[] = useMemo(() => flatten(fileIconSlot?.values()), [fileIconSlot]);

  const componentCompareContext = useComponentCompare();
  const loadingFromContext =
    componentCompareContext?.loading || componentCompareContext?.fileCompareDataByName === undefined;
  const comparingLocalChanges = componentCompareContext?.compare?.hasLocalChanges;

  const [ignoreWhitespace, setIgnoreWhitespace] = useState<boolean>(false);
  const [view, setView] = useState<CodeCompareView>('inline');
  const [wrap, setWrap] = useState<boolean>(false);

  const monacoRef = useRef<{
    monaco: typeof Monaco;
    editor: Monaco.editor.IStandaloneDiffEditor;
    reviewManager?: {
      original?: ReviewManager;
      modified?: ReviewManager;
    };
  }>();

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

  const handleEditorDidMount: DiffOnMount = (editor, monaco) => {
    /**
     * disable syntax check
     * ts cant validate all types because imported files aren't available to the editor
     */
    monacoRef.current = { monaco, editor };
    if (monacoRef.current) {
      monacoRef.current.monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
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
    if (view === 'split') {
      const original = new ReviewManager(
        editor.getOriginalEditor(),
        'luv',
        (event) => {
          console.log('🚀 ~ file: code-compare-view.tsx:169 ~ OriginalEditor', event);

          if (event.type === 1) {
            const newComment = event.comments.find((c) => !c.id);

            if (newComment) {
              COMMENTS.push({ ...newComment, id: Math.random().toLocaleString() });
              monacoRef.current?.reviewManager?.modified?.refresh(COMMENTS);
            }
          }
        },
        COMMENTS,
        {},
        true
      );

      monacoRef.current.reviewManager = {
        ...(monacoRef.current.reviewManager || {}),
        original,
      };
    }

    const modified = new ReviewManager(
      editor.getModifiedEditor(),
      'luv',
      (event) => {
        console.log('🚀 ~ file: code-compare-view.tsx:196 ~ ModifiedEditor', event);
        if (event.type === 1) {
          const newComment = event.comments.find((c) => !c.id);

          if (newComment) {
            COMMENTS.push({ ...newComment, id: Math.random().toLocaleString() });
            monacoRef.current?.reviewManager?.modified?.refresh(COMMENTS);
          }
        }
      },
      COMMENTS,
      {},
      true
    );

    monacoRef.current.reviewManager = {
      ...(monacoRef.current.reviewManager || {}),
      modified,
    };
  };

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
          ignoreTrimWhitespace: ignoreWhitespace,
          readOnly: true,
          renderSideBySide: view === 'split',
          minimap: { enabled: false },
          scrollbar: { alwaysConsumeMouseWheel: false },
          scrollBeyondLastLine: false,
          folding: false,
          overviewRulerLanes: 0,
          overviewRulerBorder: false,
          wordWrap: (wrap && 'on') || 'off',
          wrappingStrategy: (wrap && 'advanced') || undefined,
          fixedOverflowWidgets: true,
          renderLineHighlight: 'none',
          lineHeight: 18,
          padding: { top: 8 },
        }}
        loading={<CodeCompareViewLoader />}
      />
    ),
    [modifiedFileContent, originalFileContent, ignoreWhitespace, view, wrap]
  );

  // todo fix switching between split / inline
  // do not render review manager on original when in inline mode
  useEffect(() => {
    if (!monacoRef.current) return;

    const originalEditor = monacoRef.current?.editor.getOriginalEditor();
    const originalReviewManager = monacoRef.current?.reviewManager?.original;

    if (view === 'split' && !originalReviewManager) {
      const original = new ReviewManager(
        originalEditor,
        'luv',
        (actions) => {
          console.log(actions);
        },
        COMMENTS,
        {},
        true
      );
      monacoRef.current.reviewManager = {
        ...(monacoRef.current?.reviewManager || {}),
        original,
      };
    } else if (view === 'split') {
      originalReviewManager?.dispose();
      monacoRef.current.reviewManager = {
        ...(monacoRef.current?.reviewManager || {}),
        original: undefined,
      };
    }

    if (view === 'inline' && originalReviewManager) {
      // dispose delta decorations from original editor
      originalReviewManager.dispose();
      monacoRef.current.reviewManager = {
        ...(monacoRef.current?.reviewManager || {}),
        original: undefined,
      };
    }
  }, [view]);

  return (
    <div
      key={`component-compare-code-view-${fileName}`}
      className={classNames(styles.componentCompareCodeViewContainer, className, loading && styles.loading)}
    >
      {!loading && (
        <CodeCompareNav
          files={files}
          selectedFile={fileName}
          fileIconMatchers={fileIconMatchers}
          onTabClicked={onTabClicked}
          getHref={getHref}
          widgets={widgets}
        >
          <Dropdown
            className={styles.codeCompareWidgets}
            dropClass={styles.codeCompareMenu}
            placeholder={
              <div className={styles.codeCompareWidgets}>
                <div className={styles.settings}>
                  <img src={'https://static.bit.dev/bit-icons/setting.svg'}></img>
                </div>
              </div>
            }
            clickPlaceholderToggles={true}
            position={'left-start'}
            clickToggles={false}
          >
            <div className={styles.settingsMenu}>
              <div className={styles.settingsTitle}>Diff View</div>
              <div className={styles.splitSettings}>
                <Radio
                  className={styles.splitOption}
                  checked={view === 'inline'}
                  value={'inline'}
                  onInputChanged={() => setView('inline')}
                >
                  <span>Inline</span>
                </Radio>
                <Radio
                  className={styles.splitOption}
                  checked={view === 'split'}
                  value={'split'}
                  onInputChanged={() => setView('split')}
                >
                  <span>Split</span>
                </Radio>
              </div>
              <div className={styles.ignoreWhitespaceSettings}>
                <CheckboxItem checked={ignoreWhitespace} onInputChanged={() => setIgnoreWhitespace((value) => !value)}>
                  Hide whitespace
                </CheckboxItem>
              </div>
              <div className={styles.wordWrapSettings}>
                <CheckboxItem checked={wrap} onInputChanged={() => setWrap((value) => !value)}>
                  Word wrap
                </CheckboxItem>
              </div>
            </div>
          </Dropdown>
        </CodeCompareNav>
      )}
      {loading && <LineSkeleton className={styles.loader} count={3} />}
      <div className={classNames(styles.componentCompareCodeDiffEditorContainer, loading && styles.loading)}>
        {loading ? <CodeCompareViewLoader /> : diffEditor}
      </div>
    </div>
  );
}

function CodeCompareViewLoader() {
  return <LineSkeleton className={styles.loader} count={50} />;
}

function CodeCompareNav({
  files,
  selectedFile,
  fileIconMatchers,
  onTabClicked,
  getHref,
  children,
  widgets,
}: {
  files: string[];
  selectedFile: string;
  fileIconMatchers: FileIconMatch[];
  getHref: (node: { id: string }) => string;
  onTabClicked?: (id: string, event?: React.MouseEvent) => void;
  children: React.ReactNode;
  widgets?: ComponentType<WidgetProps<any>>[];
}) {
  const extractedTabs: [string, NavPlugin][] = files.map((file, index) => {
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
          className: classNames(styles.compareNavItem, index === 0 && styles.first),
          children: (
            <div className={styles.codeCompareTab}>
              <img src={getFileIcon(fileIconMatchers, file)}></img>
              <span>{file}</span>
              <div className={styles.codeCompareTabRight}>
                {widgets?.map((Widget, widgetIndex) => (
                  <Widget key={widgetIndex} node={{ id: file }} />
                ))}
              </div>
            </div>
          ),
          ignoreQueryParams: true,
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
      >
        {children}
      </CollapsibleMenuNav>
    </div>
  );
}
