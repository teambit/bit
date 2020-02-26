import { ComponentGraph } from '../graph/component-graph';
import FindCycles from './all-insights/find-cycles';

export default function getCoreInsights(componentGraph: ComponentGraph) {
  const coreInsights = [new FindCycles(componentGraph)];
  return coreInsights;
}
