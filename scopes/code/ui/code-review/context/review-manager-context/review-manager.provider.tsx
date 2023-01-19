import React, { ReactNode } from 'react';
import { CodeCompareReviewManagerProps } from '@teambit/code.ui.code-compare';
import { ReviewManagerContext } from './review-manager.context';

export type ReviewManagerProviderProps = {
  children: ReactNode;
  props: CodeCompareReviewManagerProps;
};

export function ReviewManagerProvider({ props, children }: ReviewManagerProviderProps) {
  return <ReviewManagerContext.Provider value={props}>{children}</ReviewManagerContext.Provider>;
}
