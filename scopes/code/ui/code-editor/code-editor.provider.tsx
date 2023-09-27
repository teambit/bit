import React, { createContext, useContext, ReactNode } from 'react';

const CodeEditorContext = createContext<any>(null);

type CodeEditorProviderProps = {
  children: ReactNode;
};

export const CodeEditorProvider: React.FC<CodeEditorProviderProps> = ({ children }) => {
  const Editor = React.lazy(() => {
    return import('@monaco-editor/react').then((module) => ({ default: module.default }));
  });

  return <CodeEditorContext.Provider value={Editor}>{children}</CodeEditorContext.Provider>;
};

export const useCodeEditor = () => {
  return useContext(CodeEditorContext);
};
