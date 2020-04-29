import Reporter from './reporter';
import { Logger } from '@bit/bit.core.logger';

export type ReporterDeps = [Logger];

export async function provideReporter([logger]: ReporterDeps) {
  return new Reporter(logger);
}
