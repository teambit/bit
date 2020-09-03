import { expect } from 'chai';

import * as constants from '../../constants';
import { checkVersionCompatibilityOnTheServer } from './check-version-compatibility';
import { OldClientVersion } from './exceptions';

const setServerVersion = (serverVersion) => {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  constants.BIT_VERSION = serverVersion;
};

describe('check-version-compatibility', () => {
  describe('checkVersionCompatibilityOnTheServer', () => {
    it('should not throw any error when the major versions of the server and the client are the same', () => {
      setServerVersion('14.0.0');
      const func = () => checkVersionCompatibilityOnTheServer('14.0.0');
      expect(func).to.not.throw();
    });
    it('should not throw any error when the major version of the client is higher than the server', () => {
      setServerVersion('13.0.0');
      const func = () => checkVersionCompatibilityOnTheServer('14.0.0');
      expect(func).to.not.throw();
    });
    it('should throw an OldClientVersion exception when the major version of the server is higher than the client', () => {
      setServerVersion('15.0.0');
      const func = () => checkVersionCompatibilityOnTheServer('14.0.0');
      expect(func).to.throw(OldClientVersion);
    });
    it('when there is a mismatch major version and the client version is less than 14 it should throw an error but not OldClientVersion', () => {
      setServerVersion('14.0.0');
      const func = () => checkVersionCompatibilityOnTheServer('13.0.0');
      expect(func).to.not.throw(OldClientVersion);
      expect(func).to.throw();
    });
  });
});
