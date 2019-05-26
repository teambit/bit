/** @flow */

import R from 'ramda';
import fs from 'fs-extra';
import Diagnosis from '../diagnosis';
import type { ExamineBareResult } from '../diagnosis';
import { loadConsumer } from '../../consumer';
import WorkspaceConfig from '../../consumer/config/workspace-config';
import AbstractConfig from '../../consumer/config/abstract-config';

export default class ValidateWorkspaceBitJsonSyntax extends Diagnosis {
  name = 'Validate workspace bit config';
  description = 'validate workspace bit.json';
  category = 'bit-core-files';

  _formatSymptoms(bareResult: ExamineBareResult): string {
    const bitJsonPath = R.path(['data', 'bitJsonPath'], bareResult);
    return `invalid bit.json: ${bitJsonPath} is not a valid JSON file.`;
  }

  _formatManualTreat() {
    return 'Manually fix the bit.json or consider running bit init --reset to recreate the file';
  }

  async _runExamine(): Promise<ExamineBareResult> {
    const consumer = await loadConsumer();
    const consumerPath = consumer.getPath();
    const bitJsonPath = AbstractConfig.composeBitJsonPath(consumerPath);
    const exist = await fs.exists(bitJsonPath);
    if (!exist) {
      return {
        valid: true
      };
    }
    try {
      WorkspaceConfig.loadBitJson(bitJsonPath);
      return {
        valid: true
      };
    } catch (e) {
      return {
        valid: false,
        data: {
          bitJsonPath
        }
      };
    }
  }
}
