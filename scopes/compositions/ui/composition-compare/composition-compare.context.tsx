import { CompositionContentProps } from '@teambit/compositions';
import { useContext, createContext } from 'react';

export type CompositionCompareContextModel = {
  compositionProps?: CompositionContentProps;
  isBase?: boolean;
  isCompare?: boolean;
};

export const CompositionCompareContext: React.Context<CompositionCompareContextModel | undefined> = createContext<
  CompositionCompareContextModel | undefined
>(undefined);

export const useCompositionCompare = () => useContext(CompositionCompareContext);
