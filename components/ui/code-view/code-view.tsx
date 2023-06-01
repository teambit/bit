import { H1 } from '@teambit/documenter.ui.heading';
import classNames from 'classnames';
import React, { HTMLAttributes, useMemo } from 'react';
import { OnMount, Monaco } from '@monaco-editor/react';
import { useFileContent } from '@teambit/code.ui.queries.get-file-content';
import { CodeEditor } from '@teambit/code.ui.code-editor';
import { LineSkeleton } from '@teambit/base-ui.loaders.skeleton';
import { ThemeSwitcher } from '@teambit/design.themes.theme-toggler';
import { DarkTheme } from '@teambit/design.themes.dark-theme';
import { staticStorageUrl } from '@teambit/base-ui.constants.storage';
import { ComponentID } from '@teambit/component';
import styles from './code-view.module.scss';
import { setupLanguage } from './monaco-language-init';

export type CodeViewProps = {
  componentId: ComponentID;
  currentFile?: string;
  currentFileContent?: string;
  icon?: string;
  loading?: boolean;
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

export function CodeView({
  className,
  componentId,
  currentFile,
  icon,
  currentFileContent,
  loading: loadingFromProps,
}: CodeViewProps) {
  const monacoRef = React.useRef<{
    editor: any;
    monaco: Monaco;
  }>();

  const { fileContent: downloadedFileContent, loading: loadingFileContent } = useFileContent(
    componentId,
    currentFile,
    !!currentFileContent
  );

  const loading = loadingFromProps || loadingFileContent;
  const fileContent = currentFileContent || downloadedFileContent;
  const title = useMemo(() => currentFile?.split('/').pop(), [currentFile]);
  const language = useMemo(() => {
    if (!currentFile) return languageOverrides.ts;
    const fileEnding = currentFile?.split('.').pop();
    return languageOverrides[fileEnding || ''] || fileEnding;
  }, [currentFile]);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    /**
     * disable syntax check
     * ts cant validate all types because imported files aren't available to the editor
     */
    monacoRef.current = { monaco, editor };

    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.Latest,
      allowNonTsExtensions: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      module: monaco.languages.typescript.ModuleKind.CommonJS,
      jsx: monaco.languages.typescript.JsxEmit.React,
      noEmit: true,
      typeRoots: ['node_modules/@types'],
      jsxFactory: 'JSXAlone.createElement',
      reactNamespace: 'React',
      esModuleInterop: true,
    });

    setupLanguage(monaco, language).catch(() => {});

    monaco.editor.defineTheme('bit', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'delimiter', foreground: 'ffffff' },
        { token: 'delimiter.angle', foreground: '808080' },
        { token: 'tag.dom', foreground: '569cd6' },
        { token: 'tag.custom', foreground: '4ec9b0' },
        { token: 'delimiter.bracket', foreground: 'd7ba7d' },
        { token: 'attribute.key', foreground: '9cdcfe' },
        { token: 'attribute.value', foreground: 'ce9178' },
        { token: 'delimiter.bracket', foreground: 'd7ba7d' },
        { token: 'jsx.attribute.value', foreground: 'ce9178' },
      ],

      colors: {
        'scrollbar.shadow': '#222222',
        'diffEditor.insertedTextBackground': '#1C4D2D',
        'diffEditor.removedTextBackground': '#761E24',
        'editor.selectionBackground': '#5A5A5A',
        'editor.overviewRulerBorder': '#6a57fd',
        'editor.lineHighlightBorder': '#6a57fd',
      },
    });

    monaco.editor.setTheme('bit');
  };
  const codeEditor = useMemo(
    () => (
      <CodeEditor
        language={language}
        fileContent={fileContent}
        filePath={currentFile}
        onMount={handleEditorDidMount}
        Loader={<CodeViewLoader />}
      />
    ),
    [fileContent]
  );

  if (!fileContent && !loading && currentFile) return <EmptyCodeView />;

  return (
    <div className={classNames(styles.componentCodeViewContainer, className, loading && styles.loading)}>
      <div className={styles.codeViewTitle}>
        <H1 size="sm" className={styles.fileName}>
          {currentFile && <img className={styles.img} src={icon} />}
          <span>{title}</span>
        </H1>
      </div>
      <div className={classNames(styles.componentCodeEditorContainer, loading && styles.loading)}>
        <ThemeSwitcher themes={[DarkTheme]} className={classNames(styles.themeContainer, className)}>
          <CodeViewLoader className={classNames(!loading && styles.hideLoader)} />
          {loading ? null : codeEditor}
        </ThemeSwitcher>
      </div>
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

export function CodeViewLoader({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <LineSkeleton {...rest} className={classNames(styles.loader, className)} count={75} />;
}
