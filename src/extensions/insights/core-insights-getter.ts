import { ComponentGraph } from '../graph/component-graph';
import FindCycles from './all-insights/find-cycles';
import DuplicateDependencies from './all-insights/duplicate-dependencies';

export default function getCoreInsights(componentGraph: ComponentGraph) {
  const coreInsights = [new FindCycles(componentGraph), new DuplicateDependencies(componentGraph)];
  return coreInsights;
}
