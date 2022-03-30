import { Component } from '@teambit/component';

export type InsightMetaData = {
  name: string;
  description: string;
};

export type InsightResult = {
  metaData: InsightMetaData;
  message: string;
  data: any;
  renderedData?: string;
};

export type RawResult = {
  message: string;
  data: any;
};

export interface Insight {
  name: string;
  description: string;

  /**
   * runs a specific insight using _runInsight, gets a RawResult, and uses _formatData to transform the output to InsightResult.
   */
  run(...args: any[]): Promise<InsightResult>;

  /**
   * add the results from the insights as a component-issue so then bit-status could show them and bit-tag could block
   * them.
   */
  addAsComponentIssue?(components: Component[]): Promise<void>;
}
