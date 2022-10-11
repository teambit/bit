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
};
