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

export type BareResult = {
  message?: string;
  data: any;
};

export default interface Insight {
  name: string;
  description: string;

  /**
   * A function that runs a specific insight. Can get any number of arguments.
   */
  _runInsight(...args: any[]): Promise<BareResult>;

  /**
   * Takes the data returned by the insight and stringifies it.
   * @param bareResult ExamineBareResult
   */
  _formatData(data: any): string;
}

async function runInsight(insight: Insight, ...args: any[]): Promise<InsightResult> {
  const bareResult = await insight._runInsight(...args);
  const formattedData = insight._formatData(bareResult.data);
  const result = {
    metaData: {
      name: insight.name,
      description: insight.description
    },
    data: bareResult.data,
    formattedData: formattedData
  };

  if (!!bareResult.message) {
    result['message'] = bareResult.message;
  }
  return result;
}
