import R from 'ramda';
import fs from 'fs-extra';
import Diagnosis from '../diagnosis';
import { ExamineBareResult } from '../diagnosis';
import { loadConsumer } from '../../consumer';
import { WorkspaceConfig } from '../../extensions/workspace-config';
import AbstractConfig from '../../consumer/config/abstract-config';

export default class ValidateWorkspaceBitJsonSyntax extends Diagnosis {
  name = "validate workspace's bit config";
  description = 'validate workspace configuration object';
  category = 'configuration';

  _formatSymptoms(bareResult: ExamineBareResult): string {
    const bitJsonPath = R.path(['data', 'bitJsonPath'], bareResult);
    return `invalid bit.json: ${bitJsonPath} is not a valid JSON file.`;
  }

  _formatManualTreat() {
    return 'manually fix the bit.json or consider running bit init --reset to recreate the file';
  }

  // TODO: support configuration from package.json
  async _runExamine(): Promise<ExamineBareResult> {
    const consumer = await loadConsumer();
    const consumerPath = consumer.getPath();
    try {
      await WorkspaceConfig.loadIfExist(consumerPath);
      return {
        valid: true
      };
    } catch (e) {
      return {
        valid: false,
        data: {}
      };
    }
  }
}
