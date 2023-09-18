import React, { createContext, useContext, ReactNode } from 'react';

const DiffEditorContext = createContext<any>(null);

type DiffEditorProviderProps = {
  children: ReactNode;
};

export const DiffEditorProvider: React.FC<DiffEditorProviderProps> = ({ children }) => {
  const DiffEditor = React.lazy(() => {
    return import('@monaco-editor/react').then((module) => ({ default: module.DiffEditor }));
  });

  return <DiffEditorContext.Provider value={DiffEditor}>{children}</DiffEditorContext.Provider>;
};

export const useDiffEditor = () => {
  return useContext(DiffEditorContext);
};
