export class BitBaseEvent<T> {
  constructor(
    readonly type: string,
    readonly version: string,
    readonly timestamp: number,
    readonly data: T
  ) {}
}

/**
 * the parts of the pubsub aspect that envs use, e.g. a dev server that reports its progress.
 * get it with `context.getAspect<PubsubMain>(PUBSUB_ASPECT_ID)`.
 */
export interface PubsubMain {
  sub(topicUUID: string, callback: (event: BitBaseEvent<any>) => void): void;
  pub(topicUUID: string, event: BitBaseEvent<any>): void;
}
