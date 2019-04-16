/** @flow */

export type ExamineBareResult = {
  valid: boolean,
  data?: ?Object
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

  async _runExamine(): Promise<ExamineBareResult> {
    throw new Error('You must implement this method');
  }
  _formatSymptoms(bareResult: ExamineBareResult): string {
    // eslint-disable-line no-unused-vars
    throw new Error('You must implement this method');
  }

  _formatManualTreat(bareResult: ExamineBareResult): string {
    // eslint-disable-line no-unused-vars
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
