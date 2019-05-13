/** @flow */

export type ExamineBareResult = {
  valid: boolean,
  data?: Object
};

export type DiagnosisMetaData = {
  name: string,
  description: string,
  category: string
};

export type ExamineResult = {
  diagnosisMetaData: DiagnosisMetaData,
  bareResult: ExamineBareResult,
  formattedSymptoms: string, // A human readable of the found issues
  formattedManualTreat: string // human readable steps to fix
};

export default class Diagnosis {
  name: string;
  description: string;
  category: string;
  result: Object;

  /**
   * A function that actually runs the examination
   */
  async _runExamine(): Promise<ExamineBareResult> {
    throw new Error('You must implement this method');
  }

  /**
   * Returns a descriptive symptoms message which might include specific data from the examination
   * @param bareResult ExamineBareResult
   */
  // eslint-disable-next-line no-unused-vars
  _formatSymptoms(bareResult: ExamineBareResult): string {
    throw new Error('You must implement this method');
  }

  /**
   * Returns a descriptive instruction to handle the issue (might include specific data from the examination)
   * @param bareResult ExamineBareResult
   */
  // eslint-disable-next-line no-unused-vars
  _formatManualTreat(bareResult: ExamineBareResult): string {
    throw new Error('You must implement this method');
  }

  getMeta() {
    return {
      category: this.category,
      name: this.name,
      description: this.description
    };
  }

  async examine(): Promise<ExamineResult> {
    const bareResult = await this._runExamine();
    if (bareResult.valid) {
      return {
        diagnosisMetaData: this.getMeta(),
        bareResult,
        formattedSymptoms: '',
        formattedManualTreat: ''
      };
    }
    const formattedSymptoms = this._formatSymptoms(bareResult);
    const formattedManualTreat = this._formatManualTreat(bareResult);
    return {
      diagnosisMetaData: this.getMeta(),
      bareResult,
      formattedSymptoms,
      formattedManualTreat
    };
  }
}
