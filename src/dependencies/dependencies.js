/** @flow */
import Dependency from './dependency';
import { forEach } from '../../../utils';

export default class Dependencies extends Map<string, Dependency> {
  static load(dependencies: {[string]: string}) {
    const tupleArray = [];
    
    forEach(dependencies, (version, name) => {
      tupleArray.push(Dependency.load(name, version));
    });

    return new Dependencies(tupleArray);
  }  
}
