import { ReplaySubject } from 'rxjs';
import { flatMap } from 'rxjs/operators';

/**
 * takes a stream of higher order ReplaySubjects and flattens it recursively.
 *
 * @param toFlat ReplaySubject with nested messages
 */
export function flattenReplaySubject<T = any>(toFlat: ReplaySubject<T>) {
  return toFlat.pipe(flattenNested());
}

/**
 *  RxJS operator which flatten a nested stream of ReplaySubjects.
 *
 * @param isRecursive should flatten recursively or 1 level
 */
export function flattenNested<T = any>(isRecursive = true) {
  return flatMap((x: T) => (x instanceof ReplaySubject && isRecursive ? flattenReplaySubject(x) : toReplaySubject(x)));
}

/**
 * takes an object and creates a ReplaySubject  from it.
 *
 * @param toSubject
 */
export function toReplaySubject<T = any>(toSubject: T | ReplaySubject<T>) {
  if (toSubject instanceof ReplaySubject) {
    return toSubject;
  }
  const subject = new ReplaySubject<T>();
  subject.next(toSubject);
  return subject;
}
