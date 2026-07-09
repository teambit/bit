// `reset-css` is a pure-CSS package with no type declarations. Under TypeScript 6
// (moduleResolution `bundler`/node10), a side-effect `import 'reset-css'` requires a
// resolvable module/types or it errors TS2882. This ambient declaration is co-located
// with the component so it travels into the capsule and is picked up by the env's
// `include: ["**/*"]` compile (the root tsconfig ambient shim doesn't reach env builds).
declare module 'reset-css';
