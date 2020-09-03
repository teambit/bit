import { expect } from 'chai';

import { BitId, BitIds } from '../bit-id';
import RemovedObjects from './removed-components';

describe('RemovedComponents', () => {
  const payload = {
    removedComponentIds: [],
    missingComponents: [],
    removedDependencies: [],
    dependentBits: {},
    removedLanes: [],
  };
  describe('fromObjects', () => {
    describe('with dependentBits', () => {
      let removeComponents;
      before(() => {
        const payloadWithDependents = { ...payload };
        payloadWithDependents.dependentBits = {
          'sc/utils/is-type': [
            { scope: 'sc', box: null, name: 'bar/foo', version: null },
            { scope: 'sc', box: null, name: 'utils/is-string', version: null },
          ],
        };
        removeComponents = RemovedObjects.fromObjects(payloadWithDependents);
      });
      it('should return an instance of RemovedObjects', () => {
        expect(removeComponents).to.be.instanceOf(RemovedObjects);
      });
      it('dependentBits values should be BitIds', () => {
        expect(removeComponents.dependentBits).to.be.an('object');
        Object.keys(removeComponents.dependentBits).forEach((dependent) => {
          expect(removeComponents.dependentBits[dependent]).to.be.instanceOf(BitIds);
        });
      });
      it('each BitIds should have BitId objects', () => {
        Object.keys(removeComponents.dependentBits).forEach((dependent) => {
          removeComponents.dependentBits[dependent].forEach((b) => expect(b).to.be.instanceOf(BitId));
        });
      });
    });
  });
});
