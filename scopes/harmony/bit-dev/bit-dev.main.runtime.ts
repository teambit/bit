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
    const bitDev = new BitDev();
    scope &&
      scope.registerOnPostExport(async ({ ids }, { auth }) => {
        logger.info(`export completed, reporting to: ${config.hub}`);
        try {
          const graphClient = new GraphQLClient(`${config.hub}/graphql`, { headers: bitDev.getAuthHeader(auth) });
          const EXPORT_COMPLETED = gql`
            mutation export_completed($componentIds: [String!]!) {
              exportCompleted(componentIds: $componentIds)
            }
          `;
          const componentIds = ids.map((id) => id.toString());
          await graphClient.request(EXPORT_COMPLETED, { componentIds });
        } catch (error) {
          logger.error(`failed to report`, error);
        }
      });

    return bitDev;
  }
}

BitDevAspect.addRuntime(BitDev);
