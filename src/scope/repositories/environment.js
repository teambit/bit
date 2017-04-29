// /** @flow */
// import * as path from 'path';
// import fs from 'fs';
// import R from 'ramda';
// import glob from 'glob';
// import Repository from '../repository';
// import { BitId } from '../../bit-id';
// import Component from '../../consumer/component';
// import { BIT_ENVIRONMENT_DIRNAME, LATEST } from '../../constants';
// import resolveBit from '../../consumer/bit-node-resolver';

// export default class Cache extends Repository { // DEPRECATED
//   getPath(): string {
//     return path.join(super.getPath(), BIT_ENVIRONMENT_DIRNAME);
//   }

//   composePath(bitId: BitId) {
//     return path.join(
//       this.getPath(),
//       bitId.box,
//       bitId.name,
//       bitId.getScopeWithoutRemoteAnnotation(),
//       bitId.version
//     );
//   }

//   // store(component: Component) {
//   //   const componentPath = this.composePath(component.id);
//   //   return component
//   //     .write(componentPath, true)
//   //     .then(() => installPackageDependencies(component, componentPath));
//   // }

//   findLatestVersion(bitId: BitId): string {
//     const dirToLookIn = path.join(
//       this.getPath(),
//       bitId.box,
//       bitId.name,
//       bitId.getScopeWithoutRemoteAnnotation()
//     );
//     const files = glob.sync(path.join(dirToLookIn, '*'));
//     const versions = files.map((file: string): number => {
//       return parseInt(path.basename(file));
//     });

//     return Math.max(...versions).toString();
//   }

//   get(bitId: BitId) {
//     if (bitId.version === LATEST) {
//       bitId.version = this.findLatestVersion(bitId);
//     }

//     return resolveBit(this.composePath(bitId));
//   }

//   getPathTo(bitId: BitId) {
//     if (bitId.version === LATEST) {
//       bitId.version = this.findLatestVersion(bitId);
//     }

//     return resolveBit(this.composePath(bitId), { onlyPath: true });
//   }

//   hasSync(bitId: BitId) {
//     const box = bitId.box;
//     const name = bitId.name;
//     const version = bitId.version;
//     const scope = bitId.getScopeWithoutRemoteAnnotation();
//     // @HACKALERT
//     // @TODO - maybe check for node_modules
//     const bitPath = path.join(this.getPath(), box, name, scope, version);
//     return fs.existsSync(bitPath);
//   }

//   ensureEnvironment({ testerId, compilerId }: { testerId: BitId, compilerId: BitId }):
//   Promise<any> {
//     const rejectNils = R.reject(R.isNil);
//     const envs = rejectNils([ testerId, compilerId ]);

//     const ensureEnv = (env: BitId): Promise<any> => {
//       if (this.hasSync(env)) return Promise.resolve();

//       return this.scope.get(env) // @HACKALERT - replace with getOne
//         .then(bitDependencies => this.store(bitDependencies.component));
//     };

//     return Promise.all(R.map(ensureEnv, envs));
//   }

//   // writeToEnvBitsDir(bitDependencies: ComponentDependencies[]): Promise<Bit[]> {
//   //   const bits = flattenDependencies(bitDependencies);
//   //   return Promise.all(
//   //     bits.map(bit =>
//   //       this.cdAndWrite(bit, this.getPath())
//   //       .then(installPackageDependencies)
//   //     )
//   //   );
//   // }
// }
