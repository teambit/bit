import { expect } from 'chai';
import { getDivergeDataBetweenTwoSnaps } from './get-diverge-data';
import * as SourceTargetDiffDistance from './fixtures/source-target-diff-distance';
import { Ref, VersionHistory } from '@teambit/scope.objects';

describe('getDivergeDataBetweenTwoSnaps', () => {
  describe('when there are multiple common-snaps, some are closer to the source and some are closer to the target', () => {
    it('should return the one that is a parent of the other', () => {
      const { source, target, history } = SourceTargetDiffDistance;
      const sourceRef = new Ref(source);
      const targetRef = new Ref(target);
      const versionHistory = VersionHistory.parse(JSON.stringify(history));

      const results = getDivergeDataBetweenTwoSnaps(versionHistory.id(), versionHistory.versions, sourceRef, targetRef);
      // previously, it was equal to e355e50838f94b5eb1411e349d36e5e68a84ec4d because it was closer to the source.
      // now we check both: source and target.
      expect(results.commonSnapBeforeDiverge?.toString()).to.equal('ea7fdd5978b686f1ac6efe10a4caf2c7e197606c');
    });
  });
});
