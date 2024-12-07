import { BitError } from '@teambit/bit-error';

export default class UnexpectedNetworkError extends BitError {
  message: string;
  showDoctorMessage: boolean;

  constructor(message = 'unknown error') {
    super(`unexpected network error has occurred.
${message ? `server responded with: "${message}"` : ''}`);
    this.message = message;
  }
}
