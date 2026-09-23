import type { ReactNode } from 'react';
import React from 'react';

type CodeEditorProviderProps = {
  children: ReactNode;
};

/**
 * @deprecated CodeEditor is now a static Shiki renderer and no longer needs a runtime provider.
 * Kept as a pass-through so independently-versioned consumers remain compatible.
 */
export const CodeEditorProvider: React.FC<CodeEditorProviderProps> = ({ children }) => <>{children}</>;

/**
 * @deprecated CodeEditor no longer requires an injected editor implementation.
 */
export const useCodeEditor = () => null;
