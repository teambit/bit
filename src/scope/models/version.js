/** @flow */
import { Ref, BitObject } from '../../objects';

export default class Version extends BitObject {
  impl: Ref;
  specs: Ref;
  compiler: ?Ref;
  tester: ?Ref;
  dependencies: Ref[];
  flattenedDepepdencies: Ref[];
  packageDependencies: {[string]: string};
  buildStatus: {

  };
  testStatus: {

  };

}
