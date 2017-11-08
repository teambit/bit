import passphraseSchema from './schemas/passphrase';
import userpassSchema from './schemas/user-password';
import prompt from './prompt';

const passphrase = prompt(passphraseSchema);
const userpass = prompt(userpassSchema);

export { passphrase, userpass };
