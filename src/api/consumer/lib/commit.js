/** @flow */
import R from 'ramda';
import { loadConsumer } from '../../../consumer';
import InvalidIdOnCommit from './exceptions/invalid-id-on-commit';
import ComponentsList from '../../../consumer/component/components-list';
import {  MissingDependencies } from '../../../consumer/exceptions';
import logger from '../../../logger/logger';

export async function commitAction({ id, message, force, verbose }:
{ id: string, message: string, force: ?bool, verbose?: bool }) {
  try {
    const consumer = await loadConsumer();
    const components = await consumer.commit([id], message, force, verbose);
    return R.head(components);
  } catch (err) {
    if (err instanceof MissingDependencies) return Promise.reject(err);
    logger.info('real error during commit:', err.message);
    // TODO: should be changes, we don't want this to be always the error, it should propagate from the below layer
    return Promise.reject(new InvalidIdOnCommit(id));
  }
}

export async function commitAllAction({ message, force, verbose }:
{ message: string, force: ?bool, verbose?: bool }) {
  const consumer = await loadConsumer();
  const componentsList = new ComponentsList(consumer);
  const commitPendingComponents = await componentsList.listCommitPendingComponents();
  if (R.isEmpty(commitPendingComponents)) return null;
  return consumer.commit(commitPendingComponents, message, force, verbose);
}
