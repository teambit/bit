import { loadConsumer } from '@teambit/legacy.consumer';
import { LegacyWorkspaceConfig } from '@teambit/legacy.consumer-config';
import Diagnosis, { ExamineBareResult } from '../diagnosis';

export default class ValidateWorkspaceBitJsonSyntax extends Diagnosis {
  name = "validate workspace's bit config";
  description = 'validate workspace configuration object';
  category = 'configuration';

  _formatSymptoms(bareResult: ExamineBareResult): string {
    const bitJsonPath = bareResult?.data?.bitJsonPath;
    return `invalid workspace.jsonc: ${bitJsonPath} is not a valid JSON file.`;
  }

  _formatManualTreat() {
    return 'manually fix the workspace.jsonc or consider running bit init --reset to recreate the file';
  }

  // TODO: support configuration from package.json
  async _runExamine(): Promise<ExamineBareResult> {
    const consumer = await loadConsumer();
    const consumerPath = consumer.getPath();
    try {
      await LegacyWorkspaceConfig.loadIfExist(consumerPath, consumer.scope.path);
      return {
        valid: true,
      };
    } catch {
      return {
        valid: false,
        data: {},
      };
    }
  }
}
