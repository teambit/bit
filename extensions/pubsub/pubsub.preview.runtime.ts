import { PreviewAspect, PreviewRuntime } from '@teambit/preview';

import { connectToParent } from 'penpal';

import { BitBaseEvent } from './bit-base-event';
import { PubsubAspect } from './pubsub.aspect';

export class PubsubPreview {
  private _parentPubsub;

  constructor() {}

  public async updateParentPubsub() {
    return await connectToParent({ timeout: 300 })
      .promise.then((parentPubsub) => {
        this._parentPubsub = parentPubsub;
        console.log('parentPubsub', parentPubsub);// TODO: use log aspect
      })
      .catch((err) => {
        console.error('Attempt to connect to the parent window failed', err);// TODO: use log aspect
        return this.updateParentPubsub();
      });
  }

  // TODO[uri]: need to run on every possibility of adding new IFrames
  // Autorun init on focus
  public async updateParentPubsubWithRetry() {
    window.addEventListener('focus', () => {this.init()});
  }

  public init(){
    const self = this;

    // Making sure parent call connect-to-child before the child call connect-to-parent
    setTimeout(() => { 
      self.updateParentPubsub();
      console.log('parentPubsub', self._parentPubsub);// TODO: use log aspect
    }, 0);
  }

  public sub(topicUUID, callback) {
    this._parentPubsub.sub(topicUUID, callback);
  }

  public pub(topicUUID, event: BitBaseEvent<any>) {
    this._parentPubsub.pub(topicUUID, event);
  }

  static runtime = PreviewRuntime;

  static async provider() {
    const pubsubPreview = new PubsubPreview();
    pubsubPreview.updateParentPubsubWithRetry();
    return pubsubPreview;
  }
}

PubsubAspect.addRuntime(PubsubPreview);
