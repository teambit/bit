import CustomError from '../../error/custom-error';
import { ComponentNotFound, MergeConflictOnRemote } from '../exceptions';
import ActionNotFound from '../exceptions/action-not-found';
import ClientIdInUse from '../exceptions/client-id-in-use';
import ServerIsBusy from '../exceptions/server-is-busy';
import { OldClientVersion, PermissionDenied, RemoteScopeNotFound, UnexpectedNetworkError } from './exceptions';
import ExportAnotherOwnerPrivate from './exceptions/export-another-owner-private';

// eslint-disable-next-line complexity
export function remoteErrorHandler(code: number, parsedError: Record<string, any>, remotePath: string, err) {
  switch (code) {
    default:
      return new UnexpectedNetworkError(parsedError ? parsedError.message : err);
    case 127:
      return new ComponentNotFound((parsedError && parsedError.id) || err);
    case 128:
      return new PermissionDenied(remotePath);
    case 129:
      return new RemoteScopeNotFound((parsedError && parsedError.name) || err);
    case 130:
      return new PermissionDenied(remotePath);
    case 131: {
      const idsWithConflicts = parsedError && parsedError.idsAndVersions ? parsedError.idsAndVersions : [];
      const idsNeedUpdate = parsedError && parsedError.idsNeedUpdate ? parsedError.idsNeedUpdate : [];
      return new MergeConflictOnRemote(idsWithConflicts, idsNeedUpdate);
    }
    case 132:
      return new CustomError(parsedError && parsedError.message ? parsedError.message : err);
    case 133:
      return new OldClientVersion(parsedError && parsedError.message ? parsedError.message : err);
    case 134: {
      const msg = parsedError && parsedError.message ? parsedError.message : err;
      const sourceScope = parsedError && parsedError.sourceScope ? parsedError.sourceScope : 'unknown';
      const destinationScope = parsedError && parsedError.destinationScope ? parsedError.destinationScope : 'unknown';
      return new ExportAnotherOwnerPrivate(msg, sourceScope, destinationScope);
    }
    case 135: {
      return new ActionNotFound((parsedError && parsedError.name) || err);
    }
    case 136: {
      return new ClientIdInUse((parsedError && parsedError.clientId) || err);
    }
    case 137: {
      return new ServerIsBusy(parsedError.queueSize, parsedError.currentExportId);
    }
  }
}
