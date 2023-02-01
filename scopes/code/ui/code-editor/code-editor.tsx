import React, { useMemo } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { darkMode } from '@teambit/base-ui.theme.dark-theme';

export type CodeEditorProps = {
  language: string;
  handleEditorDidMount?: OnMount;
  Loader: React.ReactNode;
  fileContent?: string;
  path: string;
  wordWrap?: boolean;
};

export function CodeEditor({ language, fileContent, path, handleEditorDidMount, wordWrap, Loader }: CodeEditorProps) {
  return (
    <Editor
      path={path}
      value={fileContent}
      language={language}
      height={'100%'}
      onMount={(editor, monaco) => {
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
          target: monaco.languages.typescript.ScriptTarget.ES2016,
          allowNonTsExtensions: true,
          moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
          module: monaco.languages.typescript.ModuleKind.CommonJS,
          noEmit: true,
          typeRoots: ['node_modules/@types'],
          jsx: monaco.languages.typescript.JsxEmit.React,
          jsxFactory: 'JSXAlone.createElement',
        });
        monaco.languages.typescript.typescriptDefaults.addExtraLib(
          `<<react-definition-file>>`,
          `file:///node_modules/@react/types/index.d.ts`
        );
        monaco.editor.defineTheme('bit', {
          base: 'vs-dark',
          inherit: true,
          rules: [],
          colors: {
            'scrollbar.shadow': '#222222',
          },
        });
        monaco.editor.setTheme('bit');
        handleEditorDidMount?.(editor, monaco);
      }}
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
}
