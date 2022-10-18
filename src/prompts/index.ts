import prompt from './prompt';
import analyticsSchema from './schemas/analytics-reporting';
import errorReportingSchema from './schemas/error-reporting';
import forkComponentsSchema from './schemas/fork-components';
import passphraseSchema from './schemas/passphrase';
import removeSchema from './schemas/remote-remove';
import resolveConflictSchema from './schemas/resolve-conflict';
import userpassSchema from './schemas/user-password';
import approveOperationSchema from './schemas/approve-operation';

const passphrase = prompt(passphraseSchema);
const userpass = prompt(userpassSchema);
const approveOperation = prompt(approveOperationSchema);
const removePrompt = (deleteFiles: boolean, remote: boolean) => prompt(removeSchema(deleteFiles, remote));
const resolveConflictPrompt = prompt(resolveConflictSchema);
const analyticsPrompt = prompt(analyticsSchema);
const errorReportingPrompt = prompt(errorReportingSchema);
const forkComponentsPrompt = (bitIds, remote) => prompt(forkComponentsSchema(bitIds, remote));

export {
  passphrase,
  userpass,
  approveOperation,
  removePrompt,
  resolveConflictPrompt,
  analyticsPrompt,
  errorReportingPrompt,
  forkComponentsPrompt,
};
