// eslint-disable-next-line max-classes-per-file
import BitMap from '../consumer/bit-map';
import Component from '../consumer/component/consumer-component';
import { BitCapsule } from '../capsule';
import { UserExtension } from './extension';

export class ExtensionAPI {
  constructor(public component: Component, public capsule: BitCapsule, public extension: UserExtension) {}
  /**
    Component ---> consumerComponent or modelComponent
    Workspace ---> consumer
      bitmap --> .bitmap API
      config -->
    scope ---> .bit folder
    extension
    capsule ---->
   */
}

export class BitMapAPI {
  constructor(private _bitmap: BitMap) {}
}
