import { HarmonyConfig } from './harmony-config';

describe('HarmonyConfig', () => {
  it('should parse both files', () => {
    HarmonyConfig.load('workspace.json');
  });
});
