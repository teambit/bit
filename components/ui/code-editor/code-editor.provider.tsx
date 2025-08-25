import type { ReactNode } from 'react';
import React, { createContext, useContext, useEffect, useState } from 'react';
import type { EditorProps } from '@monaco-editor/react';

const CodeEditorContext = createContext<React.FC<EditorProps> | null>(null);

type CodeEditorProviderProps = {
  children: ReactNode;
};

export const CodeEditorProvider: React.FC<CodeEditorProviderProps> = ({ children }) => {
  const [Editor, setEditor] = useState<React.FC<EditorProps> | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const loadEditor = async () => {
        const { default: MonacoEditor } = await import('@monaco-editor/react');
        setEditor(() => MonacoEditor);
      };

      loadEditor().catch((error) => {
        // eslint-disable-next-line no-console
        console.error('Failed to load Monaco Editor:', error);
      });
    }
  }, []);

  return <CodeEditorContext.Provider value={Editor}>{children}</CodeEditorContext.Provider>;
};

export const useCodeEditor = () => {
  return useContext(CodeEditorContext);
};
