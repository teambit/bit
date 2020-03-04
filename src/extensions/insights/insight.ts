export type InsightMetaData = {
  name: string;
  description: string;
};

export type InsightResult = {
  metaData: InsightMetaData;
  message?: string;
  data: any;
  formattedData: string; // human-readable format
};

export type RawResult = {
  message?: string;
  data: any;
};

export interface Insight {
  name: string;
  description: string;

  /**
   * internally runs a specific insight. Can get any number of arguments.
   */
  _runInsight(...args: any[]): Promise<RawResult>;

  /**
   * takes the data returned in RawResult and stringifies it.
   * @param data
   */
  _formatData(data: any): string;

  /**
   * runs a specific insight using _runInsight, gets a RawResult, and uses _formatData to transform the output to InsightResult.
   */
  run(...args: any[]): Promise<InsightResult>;
}
