import { TesterAspect } from './tester.aspect';
import pageStyles from './ui/tests-page.module.scss';

export { Tests } from './tester';
export type { Tester, TesterContext, CallbackFn, SpecFiles, ComponentPatternsMap, ComponentsResults } from './tester';
export type { TesterMain } from './tester.main.runtime';
export type { TesterUI } from './tester.ui.runtime';
const { testsPage, testBlock } = pageStyles;
export const styles = { testsPage, testBlock };

export { TesterAspect };
export default TesterAspect;
