import chai from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));

/**
 * Shared setup for lanes e2e tests
 */
export function setupLanesTestHelper(): Helper {
  const helper = new Helper();
  return helper;
}
