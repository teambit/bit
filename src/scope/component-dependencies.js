/** @flow */
import Component from '../consumer/bit-component';
import { fromBase64 } from '../utils';

export default class ComponentDependencies {
  component: Component;
  dependencies: Component[];

  constructor(props: { component: Component, dependencies: Component[] }) {
    this.component = props.component;
    this.dependencies = props.dependencies || [];
  }

  // serialize(): Promise<string> {
  //   return Promise.all([
  //     this.component.toTar(), 
  //     Promise.all(this.dependencies.map(bit => bit.toTar()))]
  //   )
  //   .then(([bit, dependencies]) => {
  //     return JSON.stringify({
  //       component: bit.tarball.toString('ascii'),
  //       dependencies: dependencies.map(dep => dep.tarball.toString('ascii'))
  //     });
  //   });
  // }

  // static deserialize(str: string, scope: ?string): ComponentDependencies {
  //   const json = JSON.parse(fromBase64(str));
  //   return Promise.all([
  //     Component.fromTar({ tarball: new Buffer(json.bit, 'utf8'), scope }), 
  //     Promise.all(json.dependencies.map(dep => Bit.fromTar({ tarball: new Buffer(dep, 'utf8'), scope })))
  //   ])
  //   .then(([bit, dependencies]) => new ComponentDependencies({ bit, dependencies }));
  // }

}
