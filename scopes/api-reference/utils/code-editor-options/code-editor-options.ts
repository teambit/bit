import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';

export const defaultCodeEditorOptions: monaco.editor.IStandaloneEditorConstructionOptions = {
  minimap: { enabled: false },
  scrollbar: { vertical: 'hidden', alwaysConsumeMouseWheel: false },
  scrollBeyondLastLine: false,
  readOnly: true,
  language: 'typescript',
  lineNumbers: 'off',
  folding: false,
  overviewRulerLanes: 0,
  overviewRulerBorder: false,
  wordWrap: 'on',
  automaticLayout: true,
  wrappingStrategy: 'advanced',
  fixedOverflowWidgets: true,
  hover: {
    delay: 150,
  },
  parameterHints: {
    enabled: false,
  },
  renderLineHighlight: 'none',
  lineHeight: 18,
  padding: { top: 8 },
};
