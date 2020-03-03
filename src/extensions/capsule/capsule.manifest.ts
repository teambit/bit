import Capsule from './capsule';
import { PackageManagerExt } from '../package-manager';

export default {
  name: 'Capsule',
  dependencies: [PackageManagerExt],
  config: {},
  provider: Capsule.provide
};
