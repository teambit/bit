import React, { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { APIDiffChange, APIDiffResult } from './api-diff-model';

export type ApiDiffInsightContext = {
  /** component id without version */
  componentId: string;
  baseId?: string;
  compareId?: string;
  result: APIDiffResult;
};

/**
 * a renderer contributed by an external aspect (via
 * `componentCompareUI.registerApiDiffInsight`) that augments a single API change
 * with extra intelligence — migration hints, affected dependents, codemods, etc.
 */
export type ApiDiffInsight = {
  id: string;
  /** when omitted, the insight renders for every change */
  matches?: (change: APIDiffChange, ctx: ApiDiffInsightContext) => boolean;
  render: (change: APIDiffChange, ctx: ApiDiffInsightContext) => ReactNode;
};

/** module-level constant so the no-insights context value keeps a stable identity across renders */
const EMPTY_INSIGHTS: ApiDiffInsight[] = [];

const InsightsContext = createContext<ApiDiffInsight[]>(EMPTY_INSIGHTS);

export function ApiDiffInsightProvider({ insights, children }: { insights?: ApiDiffInsight[]; children: ReactNode }) {
  return <InsightsContext.Provider value={insights ?? EMPTY_INSIGHTS}>{children}</InsightsContext.Provider>;
}

export function useApiDiffInsights(): ApiDiffInsight[] {
  return useContext(InsightsContext);
}
