export type { SpanAttributes, SpanEmitter, LoadFailure } from './load-trace';
export {
  LoadSpan,
  LoadTrace,
  setSpanEmitter,
  currentLoadTrace,
  currentLoadSpan,
  getLoadTraceLogPrefix,
  startOrJoinLoadTrace,
  loadSpan,
  reportLoadFailure,
} from './load-trace';
