import Diagnosis from './diagnosis';

/*
 * Setting up block level variable to store class state
 * set's to null by default.
 */
let instance = null;

const _checkName = (name) => (diagnosis: Diagnosis) => {
  return diagnosis.name === name;
};

export default class DoctorRegistrar {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  diagnoses: Diagnosis[];

  constructor() {
    if (!instance) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      instance = this;
    }

    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
