import { expect } from 'chai';
import { ConfigMergeResult } from './config-merge-result';

describe('ConfigMergeResult', function () {
  describe('generateMergeConflictFile()', () => {
    it('should generate a merge conflict file', () => {
      const mergeStrategyResult1 = {
        id: 'teambit.component/renaming',
        conflict:
          '<<<<<<< 8e589ef07ce6e9f4e7b7dce5c409c269adfc76d5 (teambit.hello/world)\n' +
          '=======\n' +
          '"teambit.component/renaming": {\n' +
          '  "renamedFrom": {\n' +
          '    "scope": "teambit.design",\n' +
          '    "name": "ui/panels/tabs",\n' +
          '    "version": "1.0.17"\n' +
          '  }\n' +
          '}\n' +
          '>>>>>>> 93ba7ce641ab443b18243d93f2725604640c2090 (main)',
      };
      const mergeStrategyResult2 = {
        id: 'teambit.envs/envs',
        conflict:
          '"teambit.envs/envs": {\n' +
          '<<<<<<< 8e589ef07ce6e9f4e7b7dce5c409c269adfc76d5 (teambit.hello/world)\n' +
          '  "env": "teambit.community/envs/community-react@2.1.8"\n' +
          '=======\n' +
          '  "env": "teambit.design/envs/react@2.0.9"\n' +
          '>>>>>>> 93ba7ce641ab443b18243d93f2725604640c2090 (main)\n' +
          '}',
      };
      const configMergeResult = new ConfigMergeResult('compIdStr', [mergeStrategyResult1, mergeStrategyResult2]);
      const generatedFile = configMergeResult.generateMergeConflictFile();
      expect(generatedFile).to.not.be.null;
      if (!generatedFile) throw new Error('generatedFile is null');
      const generatedFileSplit = generatedFile.split('\n');
      expect(generatedFileSplit[9]).to.equal('  },');
    });
  });
});
