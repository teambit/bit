import { useContext, createContext } from 'react';
import { OverviewViewProps } from './overview-compare';

export type OverviewCompareContextModel = OverviewViewProps & {
  isBase?: boolean;
  isCompare?: boolean;
};

export const OverviewViewCompareContext: React.Context<OverviewCompareContextModel | undefined> = createContext<
  OverviewViewProps | undefined
>(undefined);

export const useOverviewCompare = () => useContext(OverviewViewCompareContext);
