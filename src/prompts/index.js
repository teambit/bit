import passphraseSchema from './schemas/passphrase';
import userpassSchema from './schemas/user-password';
import removeSchema from './schemas/remote-remove';
import resolveConflictSchema from './schemas/resolve-conflict';
import prompt from './prompt';

const passphrase = prompt(passphraseSchema);
const userpass = prompt(userpassSchema);
const removePrompt = prompt(removeSchema);
const resolveConflictPrompt = prompt(resolveConflictSchema);

export { passphrase, userpass, removePrompt, resolveConflictPrompt };
