import { gql, GraphQLClient } from 'graphql-request';
import { MainRuntime } from '@teambit/cli';
import { ScopeMain, ScopeAspect } from '@teambit/scope';
import { LoggerAspect, LoggerMain } from '@teambit/logger';
import { BitDevAspect } from './bit-dev.aspect';

export type Config = {
  hub: string;
};

export class BitDev {
  static runtime = MainRuntime;
  static dependencies: any = [ScopeAspect, LoggerAspect];
  static defaultConfig = {
    hub: 'https://symphony.bit.dev',
  };

  getAuthHeader(authData?: { type?: string; credentials?: string }) {
    return {
      Authorization: `${authData?.type} ${authData?.credentials}`,
    };
  }

  static async provider([scope, loggerMain]: [ScopeMain, LoggerMain], config: Config) {
    const logger = loggerMain.createLogger(ScopeAspect.id);
    const onExportMain = new BitDev();
    scope.registerOnPostExport(async ({ ids }, { auth }) => {
      logger.info(`export completed, reporting to: ${config.hub}`);
      try {
        const graphClient = new GraphQLClient(`${config.hub}/graphql`, { headers: onExportMain.getAuthHeader(auth) });
        const EXPORT_COMPLETED = gql`
          mutation export_completed($bitIds: [String!]!) {
            export_completed(bitIds: $bitIds)
          }
        `;
        const bitIds = ids.map((id) => id.toString());
        await graphClient.request(EXPORT_COMPLETED, { bitIds });
      } catch (error) {
        logger.error(`failed to report`, error);
      }
    });

    return onExportMain;
  }
}

BitDevAspect.addRuntime(BitDev);
