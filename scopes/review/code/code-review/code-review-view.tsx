import { DiffEditor, DiffOnMount } from '@monaco-editor/react';
import React, { ComponentType, HTMLAttributes, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { LineSkeleton } from '@teambit/base-ui.loaders.skeleton';
import { darkMode } from '@teambit/base-ui.theme.dark-theme';
import { FileIconSlot } from '@teambit/code';
import { useFileContent } from '@teambit/code.ui.queries.get-file-content';
import { FileIconMatch, getFileIcon } from '@teambit/code.ui.utils.get-file-icon';
import { CollapsibleMenuNav, NavPlugin } from '@teambit/component';
import { useComponentCompare } from '@teambit/component.ui.component-compare.context';
import { CheckboxItem } from '@teambit/design.inputs.selectors.checkbox-item';
import { Radio } from '@teambit/design.ui.input.radio';
import { Dropdown } from '@teambit/evangelist.surfaces.dropdown';
import { ICodeAnnotator } from '@teambit/review.code.annotator';
import { WidgetProps } from '@teambit/ui-foundation.ui.tree.tree-node';
import classNames from 'classnames';
import flatten from 'lodash.flatten';
import * as Monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { CodeReviewViewMode, CodeReviewViewState, CodeReviewAnnotatorProps } from './models';

import styles from './code-review.module.scss';

export type CodeReviewViewProps = {
  fileName: string;
  files: string[];
  onTabClicked?: (id: string, event?: React.MouseEvent) => void;
  getHref: (node: { id: string }) => string;
  fileIconSlot?: FileIconSlot;
  widgets?: ComponentType<WidgetProps<any>>[];
  codeAnnotator?: CodeReviewAnnotatorProps;
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

export function CodeReviewView({
  className,
  fileName,
  files,
  onTabClicked,
  getHref,
  fileIconSlot,
  widgets,
  codeAnnotator,
}: CodeReviewViewProps) {
  const componentCompareContext = useComponentCompare();
  const comparingLocalChanges = componentCompareContext?.compare?.hasLocalChanges;
  const codeCompareDataForFile = componentCompareContext?.fileCompareDataByName?.get(fileName);
  const loadingFromContext =
    componentCompareContext?.loading || componentCompareContext?.fileCompareDataByName === undefined;

  /**
   * when comparing with workspace changes, query without id
   */
  const compareId = comparingLocalChanges
    ? componentCompareContext?.compare?.model.id.changeVersion(undefined)
    : componentCompareContext?.compare?.model.id;
  const baseId = componentCompareContext?.base?.model.id;
  /**
   * when there is no component to compare with, fetch file content
   */
  const { fileContent: downloadedCompareFileContent, loading: loadingDownloadedCompareFileContent } = useFileContent(
    compareId,
    fileName,
    loadingFromContext || !!codeCompareDataForFile?.compareContent
  );
  const { fileContent: downloadedBaseFileContent, loading: loadingDownloadedBaseFileContent } = useFileContent(
    baseId,
    fileName,
    loadingFromContext || !!codeCompareDataForFile?.baseContent
  );
  const fileIconMatchers: FileIconMatch[] = useMemo(() => flatten(fileIconSlot?.values()), [fileIconSlot]);

  const defaultView: CodeReviewViewMode = useMemo(() => {
    if (!baseId) return 'inline';
    return 'split';
  }, [baseId?.toString()]);

  const [ignoreWhitespace, setIgnoreWhitespace] = useState<boolean>(false);
  const [view, setView] = useState<CodeReviewViewMode>(defaultView);
  const [wrap, setWrap] = useState<boolean>(false);

  const monacoRef = useRef<{
    monaco: typeof Monaco;
    editor: Monaco.editor.IStandaloneDiffEditor;
    codeAnnotator?: {
      original?: ICodeAnnotator;
      modified?: ICodeAnnotator;
    };
  }>();

  const language = useMemo(() => {
    if (!fileName) return languageOverrides.ts;
    const fileEnding = fileName?.split('.').pop();
    return languageOverrides[fileEnding || ''] || fileEnding;
  }, [fileName]);

  const loading =
    loadingFromContext ||
    loadingDownloadedCompareFileContent ||
    loadingDownloadedBaseFileContent ||
    componentCompareContext?.loading;

  const originalFileContent = codeCompareDataForFile?.baseContent || downloadedBaseFileContent;

  const modifiedFileContent = codeCompareDataForFile?.compareContent || downloadedCompareFileContent;

  const getState: (_codeAnnotator?: ICodeAnnotator) => CodeReviewViewState = (_codeAnnotator) => {
    return {
      ignoreWhitespace,
      view,
      baseId,
      compareId,
      wrap,
      language,
      codeAnnotator: _codeAnnotator,
    };
  };

  const handleEditorDidMount: DiffOnMount = useCallback((editor, monaco) => {
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

    if (!codeAnnotator) return;

    if (view === 'split') {
      const props = codeAnnotator.props({ editorType: 'base' });
      const original = codeAnnotator.init({
        ...props,
        editor: editor.getOriginalEditor(),
        onChange: (event) => {
          return codeAnnotator.onChange({
            ...getState(monacoRef.current?.codeAnnotator?.original),
            editorType: 'base',
          })(event);
        },
        editorType: 'base',
      });
      monacoRef.current.codeAnnotator = {
        ...(monacoRef.current.codeAnnotator || {}),
        original,
      };
    }

    const props = codeAnnotator.props({ editorType: 'modified' });
    const modified = codeAnnotator.init({
      ...props,
      editor: editor.getModifiedEditor(),
      onChange: (event) => {
        return codeAnnotator.onChange({
          ...getState(monacoRef.current?.codeAnnotator?.modified),
          editorType: 'modified',
        })(event);
      },
      editorType: 'modified',
    });

    monacoRef.current.codeAnnotator = {
      ...(monacoRef.current.codeAnnotator || {}),
      modified,
    };
  }, []);

  const originalPath = `${componentCompareContext?.base?.model.id.toString()}-${fileName}`;
  const modifiedPath = `${componentCompareContext?.compare?.model.id.toString()}-${fileName}`;

  useEffect(() => {
    if (!monacoRef.current || !codeAnnotator) return;

    const originalEditor = monacoRef.current?.editor.getOriginalEditor();
    const originalReviewManager = monacoRef.current?.codeAnnotator?.original;

    if (view === 'split' && !originalReviewManager) {
      const props = codeAnnotator.props({ editorType: 'base' });
      const original = codeAnnotator.init({
        ...props,
        editor: originalEditor,
        onChange: (event) => {
          return codeAnnotator.onChange({
            ...getState(monacoRef.current?.codeAnnotator?.original),
            editorType: 'base',
          })(event);
        },
        editorType: 'base',
      });
      monacoRef.current.codeAnnotator = {
        ...(monacoRef.current?.codeAnnotator || {}),
        original,
      };
    }

    if (view === 'inline' && originalReviewManager) {
      // dispose decorations from original editor
      originalReviewManager.dispose();
      delete monacoRef.current?.codeAnnotator?.original;
      codeAnnotator.onDestroy({ editorType: 'base' });
    }
  }, [view]);

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

  return (
    <div className={classNames(styles.componentCompareCodeViewContainer, className, loading && styles.loading)}>
      <CodeCompareNav
        files={files}
        selectedFile={fileName}
        key={files.join().concat(`-selected-${fileName}`)}
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
          clickToggles={true}
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
      <div
        key={`component-compare-code-view-${fileName}`}
        className={classNames(styles.componentCompareCodeDiffEditorContainer, loading && styles.loading)}
      >
        {!loading ? diffEditor : <CodeCompareViewLoader />}
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
