import AbstractError from '../../../error/abstract-error';

type DivergeData = { id: string; snapsLocal: number; snapsRemote: number };

export default class ComponentsPendingMerge extends AbstractError {
  divergeData: DivergeData[];
  constructor(divergeData: DivergeData[]) {
    super();
    this.divergeData = divergeData;
  }
}
