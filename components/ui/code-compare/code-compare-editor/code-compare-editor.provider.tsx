/* eslint-disable react/prop-types */
import type { ReactNode } from 'react';
import React from 'react';

type CodeCompareEditorProviderProps = {
  children: ReactNode;
};

export const CodeCompareEditorProvider: React.FC<CodeCompareEditorProviderProps> = ({ children }) => {
  return <>{children}</>;
};

/** @deprecated the Shiki diff renderer no longer needs an injected editor component. */
export const useCodeCompareEditor = () => null;
