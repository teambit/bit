import * as BPromise from 'bluebird';
import loudRejection from 'loud-rejection';
import buildRegistrar from './cli/command-registrar-builder';
import loadExtensions from './extensions/extensions-loader';
import HooksManager from './hooks';
import capsuleOrchestrator from './orchestrator/orchestrator';
import { loadConsumer } from './consumer';

process.env.MEMFS_DONT_WARN = 'true'; // suppress fs experimental warnings from memfs

// removing this, default to longStackTraces also when env is `development`, which impacts the
// performance dramatically. (see http://bluebirdjs.com/docs/api/promise.longstacktraces.html)
BPromise.config({
  longStackTraces: process.env.BLUEBIRD_DEBUG
});

loudRejection();
HooksManager.init();

// Load extensions
// eslint-disable-next-line promise/catch-or-return
loadExtensions().then(async extensions => {
  // Make sure to register all the hooks actions in the global hooks manager
  const consumer = await loadConsumer();
  if (consumer) await capsuleOrchestrator.buildPools();

  extensions.forEach(extension => {
    extension.registerHookActionsOnHooksManager();
  });
  const extensionsCommands = extensions.reduce((acc, curr) => {
    if (curr.commands && curr.commands.length) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      acc = acc.concat(curr.commands);
    }
    return acc;
  }, []);
  const registrar = buildRegistrar(extensionsCommands);

  try {
    registrar.run();
  } catch (err) {
    console.error('loud rejected:', err); // eslint-disable-line no-console
  }
});
