import Isolator from './isolator';
import { PackageManagerExt } from '@bit/bit.core.package-manager';

export default {
  name: 'Isolator',
  dependencies: [PackageManagerExt],
  config: {},
  provider: Isolator.provide
};
