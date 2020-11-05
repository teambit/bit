import { ReplaySubject } from 'rxjs';
import { flatMap } from 'rxjs/operators';

type NetworkMessages<N = any, F = any, T = any> = ReplaySubject<N | FlowMessages<F, T>>;
type FlowMessages<F = any, T = any> = ReplaySubject<F | ReplaySubject<T>>;

/**
 * takes a stream of higher order ReplaySubjects and flattens it recursively.
 *
 * @param toFlat ReplaySubject with nested messages
 */
export function flattenReplaySubject(toFlat: ReplaySubject<NetworkMessages> | ReplaySubject<FlowMessages>) {
  return toFlat.pipe(flattenNestedMap() as any);
}

/**
 *  RxJS operator which flatten a nested stream of ReplaySubjects.
 *
 * @param isRecursive should flatten recursively or 1 level
 */
export function flattenNestedMap<N = any, F = any, T = any>(isRecursive = true) {
  return flatMap(function (toFlat: N | ReplaySubject<FlowMessages<F, T>>) {
    return toFlat instanceof ReplaySubject && isRecursive ? flattenReplaySubject(toFlat) : toReplaySubject(toFlat);
  }) as any;
}

/**
 * takes an object and creates a ReplaySubject from it.
 *
 * @param toSubject
 */
export function toReplaySubject<N, F, T>(toSubject: N | F | ReplaySubject<FlowMessages<F, T>>) {
  if (toSubject instanceof ReplaySubject) {
    return toSubject;
  }
  const subject = new ReplaySubject<any>();
  subject.next(toSubject);
  subject.complete();
  return subject;
}
