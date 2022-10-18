import { createContext, useContext } from 'react';
import { FileCompareResult } from '@teambit/component.ui.compare';

export type CodeCompareModel = {
  fileCompareDataByName: Map<string, FileCompareResult>;
  loading?: boolean;
};

export const CodeCompareContext = createContext<CodeCompareModel | undefined>(undefined);
export const useCodeCompare: () => CodeCompareModel | undefined = () => {
  const codeCompareContext = useContext(CodeCompareContext);
  return codeCompareContext;
};
