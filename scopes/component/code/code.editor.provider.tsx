import React, { createContext, useContext, ReactNode } from 'react';

const EditorContext = createContext<any>(null);

type EditorProviderProps = {
  children: ReactNode;
};

export const EditorProvider: React.FC<EditorProviderProps> = ({ children }) => {
  const Editor = React.lazy(() => {
    return import('@monaco-editor/react').then((module) => ({ default: module.default }));
  });

  return <EditorContext.Provider value={Editor}>{children}</EditorContext.Provider>;
};

export const useEditor = () => {
  return useContext(EditorContext);
};
