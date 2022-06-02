import { TesterAspect } from './tester.aspect';
import styles from './ui/tests-page.module.scss';

export { Tests } from './tester';
export type { Tester, TesterContext, CallbackFn, SpecFiles, ComponentPatternsMap, ComponentsResults } from './tester';
export type { TesterMain } from './tester.main.runtime';
export type { TesterUI } from './tester.ui.runtime';
const { testsPage, testBlock } = styles;
export { testsPage as testsPageClass, testBlock as testBlockClass };

export { TesterAspect };
export default TesterAspect;
