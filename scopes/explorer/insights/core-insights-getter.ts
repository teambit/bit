import { GraphBuilder } from '@teambit/graph';

import DuplicateDependencies from './all-insights/duplicate-dependencies';
import FindCycles from './all-insights/find-cycles';

export default function getCoreInsights(graphBuilder: GraphBuilder) {
  const coreInsights = [new FindCycles(graphBuilder), new DuplicateDependencies(graphBuilder)];
  return coreInsights;
}
