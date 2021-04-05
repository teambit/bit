import { TesterAspect } from './tester.aspect';

export type { Tester, Tests, TesterContext, CallbackFn, SpecFiles, ComponentPatternsMap } from './tester';
export type { TesterMain } from './tester.main.runtime';
export type { TesterUI } from './tester.ui.runtime';

export { TesterAspect };
export default TesterAspect;
