import { useContext, createContext } from 'react';
import type { CompositionContentProps } from '@teambit/compositions';

export type CompositionCompareContextModel = {
  compositionProps?: CompositionContentProps;
  isBase?: boolean;
  isCompare?: boolean;
};

export const CompositionCompareContext: React.Context<CompositionCompareContextModel | undefined> = createContext<
  CompositionCompareContextModel | undefined
>(undefined);

export const useCompositionCompare = () => useContext(CompositionCompareContext);
