import { BIT_VERSION } from '../constants';

export default function formatUnhandled() {
  if (process.argv[2]) {
    if (process.argv[2] === '-V' || process.argv[2] === '-v' || process.argv[2] === '--version') {
      console.log(BIT_VERSION); // eslint-disable-line no-console
      process.exit();
    }
  }
}
