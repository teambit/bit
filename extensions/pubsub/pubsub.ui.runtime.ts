import { UIAspect, UIRuntime } from '@teambit/ui';

import { connectToChild } from 'penpal';

import { BitBaseEvent } from './bit-base-event';
import { PubsubAspect } from './pubsub.aspect';

export class PubsubUI {

  private topicMap = {};
  private _childs;


  private getAllIframes = () => {
    return Array.from(document.getElementsByTagName('iframe'));
  };

  private connectToIframe = async (iframe) => {
    const self = this;
    
    return await connectToChild({
      timeout: 300, 
      iframe,
      methods: {
        sub(topicUUID, callback) {
          return self.sub(topicUUID, callback);
        },
        pub(topicUUID, event: BitBaseEvent<any>) {
          return self.pub(topicUUID, event);
        },
      },
    })
    .promise.then((child) => (child))
    .catch((err) => {
      console.error('--ui-->', err)
      return this.connectToIframe(iframe);
    });
  };

  private updateConnectionsList() {
    const _iframes = this.getAllIframes();
    return  _iframes.map((iframe) => this.connectToIframe(iframe));
  }
  
  public async updateConnectionListWithRetry(){
    const t = setInterval(() => {
      const childs = this.updateConnectionsList();
      if(childs){
        this._childs = childs;
        clearInterval(t);
      }
    }, 300);
  }

  constructor() {}

  private createOrGetTopic = (topicUUID) => {
    this.topicMap[topicUUID] = this.topicMap[topicUUID] || [];
  };

  public sub = (topicUUID, callback) => {
    this.createOrGetTopic(topicUUID);
    this.topicMap[topicUUID].push(callback);
  };

  public pub = (topicUUID, event: BitBaseEvent<any>) => {
    this.createOrGetTopic(topicUUID);
    this.topicMap[topicUUID].forEach((callback) => callback(event));
  };

  static runtime = UIRuntime;


  static async provider() {
    const pubsubUI = new PubsubUI();
    await pubsubUI.updateConnectionListWithRetry();
    return pubsubUI;
  }
}

PubsubAspect.addRuntime(PubsubUI);
