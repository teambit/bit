import passphraseSchema from './schemas/passphrase';
import userpassSchema from './schemas/user-password';
import removeSchema from './schemas/remote-remove';
import analyticsSchema from './schemas/analytics-reporting';
import errorReportingSchema from './schemas/error-reporting';

import prompt from './prompt';

const passphrase = prompt(passphraseSchema);
const userpass = prompt(userpassSchema);
const removePrompt = prompt(removeSchema);
const analyticsPrompt = prompt(analyticsSchema);
const errorReportingPrompt = prompt(errorReportingSchema);

export { passphrase, userpass, removePrompt, analyticsPrompt, errorReportingPrompt };
