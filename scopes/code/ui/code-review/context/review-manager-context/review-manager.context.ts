import { createContext, useContext } from 'react';
import { CodeCompareReviewManagerProps } from '@teambit/code.ui.code-compare';

export const ReviewManagerContext: React.Context<CodeCompareReviewManagerProps | undefined> = createContext<
  CodeCompareReviewManagerProps | undefined
>(undefined);

export const useReviewManager: () => CodeCompareReviewManagerProps | undefined = () => {
  const reviewManagerContext = useContext(ReviewManagerContext);
  return reviewManagerContext;
};
