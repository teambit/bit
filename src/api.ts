// import { getScopeComponent } from './api/consumer/index';
import HooksManager from './hooks';
// import { registerCoreExtensions } from './extensions/bit';
// import { manifestsMap as coreExtensions } from './extensions/bit';

// export { coreExtensions };

HooksManager.init();

// export function show(scopePath: string, id: string, opts?: Record<string, any>) {
//   // When using the API programmatically do not use the scope cache by default
//   const loadScopeFromCache = opts && opts.loadScopeFromCache !== undefined ? !!opts.loadScopeFromCache : false;
//   // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
//   return getScopeComponent({ scopePath, id, allVersions: opts && opts.versions, loadScopeFromCache }).then(
//     ({ component }) => {
//       if (Array.isArray(component)) {
//         return component.map((v) => v.toObject());
//       }
//       return component.toObject();
//     }
//   );
// }
