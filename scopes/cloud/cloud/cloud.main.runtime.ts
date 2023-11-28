import { MainRuntime } from '@teambit/cli';
import { v4 } from 'uuid';
import os from 'os';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import {
  getCloudDomain,
  DEFAULT_HUB_DOMAIN,
  getSymphonyUrl,
  SYMPHONY_GRAPHQL,
  getLoginUrl,
  DEFAULT_ANALYTICS_DOMAIN,
  DEFAULT_REGISTRY_URL,
  CENTRAL_BIT_HUB_URL,
  CENTRAL_BIT_HUB_NAME,
  CFG_USER_TOKEN_KEY,
} from '@teambit/legacy/dist/constants';
import globalFlags from '@teambit/legacy/dist/cli/global-flags';
import GraphqlAspect, { GraphqlMain } from '@teambit/graphql';
import { getSync, setSync } from '@teambit/legacy/dist/api/consumer/lib/global-config';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { ExpressAspect, ExpressMain } from '@teambit/express';
import { cloudSchema } from './cloud.graphql';
import { CloudAspect } from './cloud.aspect';

export interface CloudWorkspaceConfig {
  cloudDomain: string;
  cloudHubDomain: string;
  cloudApi: string;
  cloudGraphQL: string;
  loginDomain: string;
  analyticsDomain: string;
  registryUrl: string;
  cloudExporterUrl: string;
  cloudHubName: string;
}

export type CloudUser = {
  displayName?: string;
  username?: string;
  profileImage?: string;
  isLoggedIn?: boolean;
};
export class CloudMain {
  static ERROR_RESPONSE = 500;
  static DEFAULT_PORT = 8888;
  static REDIRECT = 302;
  static CLIENT_ID = v4();
  static REDIRECT_URL;

  constructor(
    private config: CloudWorkspaceConfig,
    public logger: Logger,
    public express: ExpressMain,
    public workspace: Workspace
  ) {}

  getCloudDomain(): string {
    return this.config.cloudDomain;
  }

  getCloudHubDomain(): string {
    return this.config.cloudHubDomain;
  }

  getCloudApi(): string {
    return this.config.cloudApi;
  }

  getCloudGraphQL(): string {
    return this.config.cloudGraphQL;
  }
  getLoginDomain(): string {
    return this.config.loginDomain;
  }

  getAnalyticsDomain(): string {
    return this.config.analyticsDomain;
  }

  getRegistryUrl(): string {
    return this.config.registryUrl;
  }

  getCloudExporterUrl(): string {
    return this.config.cloudExporterUrl;
  }

  getHubName(): string {
    return this.config.cloudHubName;
  }

  static isLoggedIn(): boolean {
    return !!CloudMain.getAuthToken();
  }

  static getAuthToken() {
    const processToken = globalFlags.token;
    const token = processToken || getSync(CFG_USER_TOKEN_KEY);
    if (!token) return null;

    return token;
  }

  static getAuthHeader() {
    return {
      Authorization: `Bearer ${CloudMain.getAuthToken()}`,
    };
  }

  async getCurrentUser(): Promise<CloudUser | null> {
    const isLoggedIn = CloudMain.isLoggedIn();
    if (!isLoggedIn)
      return {
        isLoggedIn: false,
      };

    const route = 'user/user';
    this.logger.debug(`getCurrentUser, url: ${this.getCloudApi()}/${route}`);
    const url = `https://${this.getCloudApi()}/${route}`;
    const opts = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...CloudMain.getAuthHeader(),
      },
    };

    return fetch(url, opts)
      .then(async (res) => {
        try {
          if (res.status === 401) {
            return {
              isLoggedIn: false,
            };
          }
          const response = await res.json();
          return { ...response.payload, isLoggedIn: false };
        } catch (e) {
          return null;
        }
      })
      .catch((err) => {
        this.logger.error(`failed to get current user, err: ${err}`);
        return null;
      });
  }

  getLoginUrl(redirectUrl?: string): string {
    const loginUrl = this.getLoginDomain();
    if (redirectUrl) {
      CloudMain.REDIRECT_URL = redirectUrl;
    }
    return encodeURI(
      `${loginUrl}?port=${CloudMain.DEFAULT_PORT}&clientId=${
        CloudMain.CLIENT_ID
      }&responseType=token&deviceName=${os.hostname()}&os=${process.platform}`
    );
  }

  public setupAuthListener() {
    if (this.workspace) {
      const expectedClientId = CloudMain.CLIENT_ID;
      const app = this.express.createApp();
      app.listen(CloudMain.DEFAULT_PORT, () => {
        this.logger.debug(`cloud express server started on port ${CloudMain.DEFAULT_PORT}`);
      });
      app.get('/', (req, res) => {
        this.logger.debug('cloud.authListener', 'received request', req.query);
        try {
          const { clientId, redirectUri } = req.query;
          let { token } = req.query;
          if (Array.isArray(token)) {
            token = token[0];
          }
          if (typeof token !== 'string') {
            res.status(400).send('Invalid token format');
            return res;
          }
          if (clientId !== expectedClientId) {
            this.logger.error('cloud.authListener', 'clientId mismatch', { expectedClientId, clientId });
            return res.status(CloudMain.ERROR_RESPONSE).send('Client ID mismatch');
          }

          setSync(CFG_USER_TOKEN_KEY, token);

          if (CloudMain.REDIRECT_URL) res.redirect(CloudMain.REDIRECT_URL);
          else if (typeof redirectUri === 'string') res.redirect(redirectUri);
          else res.status(200).send('Login successful');
          return res;
        } catch (err) {
          this.logger.error(`Error on login: ${err}`);
          res.status(CloudMain.ERROR_RESPONSE).send('Login failed');
          return res;
        }
      });
    }
  }

  static slots = [];
  static dependencies = [LoggerAspect, GraphqlAspect, ExpressAspect, WorkspaceAspect];
  static runtime = MainRuntime;
  static defaultConfig: CloudWorkspaceConfig = {
    cloudDomain: getCloudDomain(),
    cloudHubDomain: DEFAULT_HUB_DOMAIN,
    cloudApi: getSymphonyUrl(),
    cloudGraphQL: SYMPHONY_GRAPHQL,
    loginDomain: getLoginUrl(),
    analyticsDomain: DEFAULT_ANALYTICS_DOMAIN,
    registryUrl: DEFAULT_REGISTRY_URL,
    cloudExporterUrl: CENTRAL_BIT_HUB_URL,
    cloudHubName: CENTRAL_BIT_HUB_NAME,
  };
  static async provider(
    [loggerMain, graphql, express, workspace]: [LoggerMain, GraphqlMain, ExpressMain, Workspace],
    config: CloudWorkspaceConfig
  ) {
    const logger = loggerMain.createLogger(CloudAspect.id);
    const cloudMain = new CloudMain(config, logger, express, workspace);
    graphql.register(cloudSchema(cloudMain));
    cloudMain.setupAuthListener();
    return cloudMain;
  }
}

CloudAspect.addRuntime(CloudMain);
