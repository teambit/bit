/** @flow */
import Diagnosis from './diagnosis';

/*
  * Setting up block level variable to store class state
  * set's to null by default.
*/
let instance = null;

export default class DoctorRegistrar {
  diagnoses: Diagnosis[];

  constructor() {
    if (!instance) {
      instance = this;
    }

    return instance;
  }

  /**
   * Initialize the default diagnoses
   */
  static init(diagnoses: Diagnosis[] = []) {
    const self = new DoctorRegistrar();
    self.diagnoses = diagnoses;
    // diagnoses.forEach(diagnosis => self.diagnoses.push(diagnosis));
  }

  /**
   * Get the instance of the DoctorRegistrar
   * @return {DoctorRegistrar} instance of the DoctorRegistrar
   *
   */
  static getInstance(): DoctorRegistrar {
    if (!instance) {
      DoctorRegistrar.init();
    }
    // $FlowFixMe
    return instance;
  }

  /**
   * Register a new diagnosis
   * @param {Diagnosis} diagnosis
   */
  registerDiagnosis(diagnosis: Diagnosis) {
    this.diagnoses.push(diagnosis);
  }

  getDiagnosisByName(name: string) {
    return this.diagnoses.find(_checkName(name));
  }
}

const _checkName = name => (diagnosis: Diagnosis) => {
  return diagnosis.name === name;
};
