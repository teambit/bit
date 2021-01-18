import { BitError } from '@teambit/bit-error';
import { BASE_DOCS_DOMAIN } from '../../../constants';

export default class PermissionDenied extends BitError {
  scope: string;

  constructor(scope: string) {
    super(
      `error: permission to scope ${scope} was denied\nsee troubleshooting at https://${BASE_DOCS_DOMAIN}/docs/setup-authentication#authentication-issues`
    );
  }
}
