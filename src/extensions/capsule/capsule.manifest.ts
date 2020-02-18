import CapsuleFactory from './capsule';
import { PackageManagerExt } from '../package-manager';

export default {
  name: 'CapsuleFactory',
  dependencies: [PackageManagerExt],
  config: {},
  provider: CapsuleFactory.provide
};
