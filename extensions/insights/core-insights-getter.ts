import { GraphBuilder } from '@bit/bit.core.graph';
import FindCycles from './all-insights/find-cycles';
import DuplicateDependencies from './all-insights/duplicate-dependencies';

export default function getCoreInsights(graphBuilder: GraphBuilder) {
  const coreInsights = [new FindCycles(graphBuilder), new DuplicateDependencies(graphBuilder)];
  return coreInsights;
}
