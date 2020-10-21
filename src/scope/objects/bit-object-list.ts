import { BitObject } from '.';
import { Lane, ModelComponent, Version } from '../models';

export class BitObjectList {
  constructor(private objects: BitObject[]) {}

  getComponents(): ModelComponent[] {
    return this.objects.filter((object) => object instanceof ModelComponent) as ModelComponent[];
  }

  getVersions(): Version[] {
    return this.objects.filter((object) => object instanceof Version) as Version[];
  }

  getLanes(): Lane[] {
    return this.objects.filter((object) => object instanceof Lane) as Lane[];
  }

  getAll(): BitObject[] {
    return this.objects;
  }

  getAllExceptComponentsAndLanes(): BitObject[] {
    return this.objects.filter((object) => !(object instanceof ModelComponent) && !(object instanceof Lane));
  }
}
