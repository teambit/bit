import callbackChecksum from 'checksum';
import { promisify } from 'util';

const checksum = callbackChecksum;
const checksumFile = promisify(callbackChecksum.file);

export { checksum, checksumFile };
