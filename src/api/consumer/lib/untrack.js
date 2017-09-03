/** @flow */
import BitMap from '../../../consumer/bit-map';
import { BitId } from '../../../bit-id'
export default async function untrack(componentPaths: string[], id?: string, main?: string, namespace:?string, tests?: string[], exclude?: string[], override: boolean): Promise<Object> {

  componentPaths.map(id => {
    if (BitId.isValidBitId(id)){
      //bit component
    } else {
      //file
    }
  })

  const bitMap = await BitMap.load(consumer.getPath());

}
