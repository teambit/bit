import passphraseSchema from './schemas/passphrase';
import userpassSchema from './schemas/user-password';
import removeSchema from './schemas/remote-remove';
import resolveConflictSchema from './schemas/resolve-conflict';
import analyticsSchema from './schemas/analytics-reporting';
import errorReportingSchema from './schemas/error-reporting';
import forkComponentsSchema from './schemas/fork-components';
import prompt from './prompt';

const passphrase = prompt(passphraseSchema);
const userpass = prompt(userpassSchema);
const removePrompt = prompt(removeSchema);
const resolveConflictPrompt = prompt(resolveConflictSchema);
const analyticsPrompt = prompt(analyticsSchema);
const errorReportingPrompt = prompt(errorReportingSchema);
const forkComponentsPrompt = (bitIds, remote) => prompt(forkComponentsSchema(bitIds, remote));

export {
  passphrase,
  userpass,
  removePrompt,
  resolveConflictPrompt,
  analyticsPrompt,
  errorReportingPrompt,
  forkComponentsPrompt,
};
