import passphraseSchema from './schemas/passphrase';
import userpassSchema from './schemas/user-password';
import removeSchema from './schemas/remote-remove';
import prompt from './prompt';

const passphrase = prompt(passphraseSchema);
const userpass = prompt(userpassSchema);
const removePrompt = prompt(removeSchema);

export { passphrase, userpass, removePrompt };
