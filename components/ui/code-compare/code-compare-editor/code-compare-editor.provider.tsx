/* eslint-disable react/prop-types */
import React, { createContext, useContext, ReactNode } from 'react';

const CodeCompareEditorContext = createContext<any>(null);

type CodeCompareEditorProviderProps = {
  children: ReactNode;
};

export const CodeCompareEditorProvider: React.FC<CodeCompareEditorProviderProps> = ({ children }) => {
  const DiffEditor = React.lazy(() => {
    return import('@monaco-editor/react').then((module) => ({ default: module.DiffEditor }));
  });

  return <CodeCompareEditorContext.Provider value={DiffEditor}>{children}</CodeCompareEditorContext.Provider>;
};

export const useCodeCompareEditor = () => {
  return useContext(CodeCompareEditorContext);
};
