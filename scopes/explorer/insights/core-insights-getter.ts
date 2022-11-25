import { GraphMain } from '@teambit/graph';

import DuplicateDependencies from './all-insights/duplicate-dependencies';
import FindCycles from './all-insights/find-circulars';

export default function getCoreInsights(graphBuilder: GraphMain) {
  const coreInsights = [new FindCycles(graphBuilder), new DuplicateDependencies(graphBuilder)];
  return coreInsights;
}
