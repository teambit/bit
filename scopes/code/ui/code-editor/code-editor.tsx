import React, { useMemo, useCallback } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { darkMode } from '@teambit/base-ui.theme.dark-theme';
import { REACT_JSX_TYPE_DEF } from '@teambit/code.ui.code-editor-type-defs';
import { MonacoJsxSyntaxHighlight, getWorker } from 'monaco-jsx-syntax-highlight';

export type CodeEditorProps = {
  language: string;
  handleEditorDidMount?: OnMount;
  Loader: React.ReactNode;
  fileContent?: string;
  path: string;
  wordWrap?: boolean;
};

export function CodeEditor({ language, fileContent, path, handleEditorDidMount, wordWrap, Loader }: CodeEditorProps) {
  const handleDidMount = useCallback(
    (editor, monaco) => {
      /**
       * disable syntax check
       * ts cant validate all types because imported files aren't available to the editor
       */
      monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: true,
        noSyntaxValidation: true,
      });
      // JSX typings
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
      monaco.languages.typescript.typescriptDefaults.addExtraLib(
        REACT_JSX_TYPE_DEF,
        `file:///node_modules/@react/types/index.d.ts`
      );

      monaco.editor.defineTheme('bit', {
        base: 'vs-dark',
        inherit: true,
        colors: {
          'scrollbar.shadow': '#222222',
        },
      });
      monaco.editor.setTheme('bit');
      handleEditorDidMount?.(editor, monaco);
    },
    [fileContent]
  );

  const MemoizedEditor = useMemo(() => {
    return (
      <Editor
        path={path}
        value={fileContent}
        language={language}
        height={'100%'}
        onMount={handleDidMount}
        className={darkMode}
        theme={'vs-dark'}
        options={{
          readOnly: true,
          minimap: { enabled: false },
          scrollbar: { alwaysConsumeMouseWheel: false },
          scrollBeyondLastLine: false,
          folding: false,
          overviewRulerLanes: 0,
          overviewRulerBorder: false,
          wordWrap: (wordWrap && 'on') || 'off',
          wrappingStrategy: (wordWrap && 'advanced') || undefined,
          fixedOverflowWidgets: true,
          renderLineHighlight: 'none',
          lineHeight: 18,
        }}
        loading={Loader}
      />
    );
  }, [path, fileContent, wordWrap, language]);
  return MemoizedEditor;
}
