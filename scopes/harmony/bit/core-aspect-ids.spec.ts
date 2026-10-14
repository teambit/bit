import { expect } from 'chai';
import { getAllCoreAspectsIds } from './manifests';
import coreAspectIds from './core-aspect-ids.json';

describe('core-aspect-ids.json', () => {
  it('lists exactly the core aspects of the bit manifest (run "npm run generate-core-aspects-ids")', () => {
    expect([...(coreAspectIds as string[])].sort()).to.deep.equal([...getAllCoreAspectsIds()].sort());
  });
});
