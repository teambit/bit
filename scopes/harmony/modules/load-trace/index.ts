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
  loadSpanSync,
  reportLoadFailure,
} from './load-trace';
