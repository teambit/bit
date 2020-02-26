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

export default class Insight {
  name: string;
  description: string;
  constructor(name: string, description: string) {
    this.name = name;
    this.description = description;
  }
  /**
   * A function that runs a specific insight. Can get any number of arguments.
   */
  async _runInsight(...args: any[]): Promise<BareResult> {
    throw new Error('You must implement this method');
  }

  /**
   * Takes the data returned by the insight and stringifies it.
   * @param bareResult ExamineBareResult
   */
  _formatData(data: any): string {
    throw new Error('You must implement this method');
  }

  getMeta() {
    return {
      name: this.name,
      description: this.description
    };
  }

  async runInsight(...args: any[]): Promise<InsightResult> {
    const bareResult = await this._runInsight(...args);
    const formattedData = this._formatData(bareResult.data);
    const result = {
      metaData: {
        name: this.name,
        description: this.description
      },
      data: bareResult.data,
      formattedData: formattedData
    };

    if (!!bareResult.message) {
      result['message'] = bareResult.message;
    }
    return result;
  }
}
