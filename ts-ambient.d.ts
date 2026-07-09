// Ambient declarations for side-effect-only imports whose types ship as `.d.cts`
// (exports-map / CJS-declaration only) and therefore can't be resolved by this repo's
// root `tsc --noEmit` check under classic `moduleResolution: node` (node10). The
// component builds resolve them fine via `moduleResolution: bundler`; these stubs only
// satisfy the root type-check, which imports these packages purely for their side effects.
// Empty module bodies (not bare `declare module 'x';`) keep these side-effect-only:
// `import 'reset-css'` is valid, but an accidental value import is a type error.
declare module 'reset-css' {}
declare module '@mdx-js/loader' {}
