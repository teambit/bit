// @flow
import { bindAction, fetchAction } from '../actions';

export default function importAction(componentIds: string[]): Promise<any> {
  return fetchAction(componentIds)
    .then(fetchResults => bindAction().then(bindResults => ({ fetchResults, bindResults })));
}
