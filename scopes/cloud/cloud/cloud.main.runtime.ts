import { Slot, SlotRegistry } from '@teambit/harmony';
import CLIAspect, { CLIMain, MainRuntime } from '@teambit/cli';
import { v4 } from 'uuid';
import chalk from 'chalk';
import os from 'os';
import open from 'open';
import * as http from 'http';
import { Express } from 'express';
import { GetScopesGQLResponse } from '@teambit/cloud.models.cloud-scope';
import { CloudUser, CloudUserAPIResponse } from '@teambit/cloud.models.cloud-user';
import { ScopeDescriptor } from '@teambit/scopes.scope-descriptor';
import { ScopeID } from '@teambit/scopes.scope-id';
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
  CFG_USER_NAME_KEY,
} from '@teambit/legacy/dist/constants';
import ScopeAspect, { ScopeMain } from '@teambit/scope';
import globalFlags from '@teambit/legacy/dist/cli/global-flags';
import GraphqlAspect, { GraphqlMain } from '@teambit/graphql';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { ExpressAspect, ExpressMain } from '@teambit/express';
import GlobalConfigAspect, { GlobalConfigMain } from '@teambit/global-config';
import { cloudSchema } from './cloud.graphql';
import { CloudAspect } from './cloud.aspect';
import { LoginCmd } from './login.cmd';
import { LogoutCmd } from './logout.cmd';
import { WhoamiCmd } from './whoami.cmd';

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
  loginPort?: number;
}

type CloudAuthListener = {
  port: number;
  server: http.Server;
  username?: string | null;
};

export type OnSuccessLogin = ({ username, token }: { username?: string; token?: string }) => void;
export type OnSuccessLoginSlot = SlotRegistry<OnSuccessLogin>;
export class CloudMain {
  static ERROR_RESPONSE = 500;
  static DEFAULT_PORT = 8888;
  static REDIRECT = 302;
  static CLIENT_ID = v4();
  static REDIRECT_URL;
  static GRAPHQL_ENDPOINT = '/graphql';
  private authListener: CloudAuthListener | null = null;
  private expressApp: Express | null = null;

  constructor(
    private config: CloudWorkspaceConfig,
    public logger: Logger,
    public express: ExpressMain,
    public workspace: Workspace,
    public scope: ScopeMain,
    public globalConfig: GlobalConfigMain,
    public onSuccessLoginSlot: OnSuccessLoginSlot
  ) {}

  setupAuthListener({
    port: portFromParams,
  }: {
    port?: number;
  } = {}): Promise<CloudAuthListener | null> {
    return new Promise((resolve, reject) => {
      const port = portFromParams || this.getLoginPort();
      if (this.authListener && (!port || this.authListener.port === port)) {
        this.logger.debug(`Auth server is already running on port ${port}`);
        resolve(this.authListener);
        return;
      }
      const expectedClientId = CloudMain.CLIENT_ID;
      this.expressApp = this.express.createApp();
      const authServer = this.expressApp
        .listen(port, () => {
          this.logger.debug(`cloud express server started on port ${port}`);
          this.authListener = {
            port,
            server: authServer,
          };
          resolve(this.authListener);
        })
        .on('error', (err) => {
          // @ts-ignore
          const { code } = err;
          if (code === 'EADDRINUSE') {
            this.logger.error(`port: ${port} already in use, please run bit login --port <port>`);
            reject(new Error(`port: ${port} already in use, please run bit login --port <port>`));
          }
          this.logger.error(`cloud express server failed to start on port ${port}`, err);
          reject(err);
        });
      this.expressApp.get('/', (req, res) => {
        this.logger.debug('cloud.authListener', 'received request', req.query);
        try {
          const { clientId, redirectUri, username: usernameFromReq } = req.query;
          const username = typeof usernameFromReq === 'string' ? usernameFromReq : undefined;
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

          this.globalConfig.setSync(CFG_USER_TOKEN_KEY, token);
          if (username) this.globalConfig.setSync(CFG_USER_NAME_KEY, username);
          if (CloudMain.REDIRECT_URL) res.redirect(CloudMain.REDIRECT_URL);
          else if (typeof redirectUri === 'string') res.redirect(redirectUri);
          else res.status(200).send('Login successful');
          this.authListener = {
            port,
            server: authServer,
            username,
          };
          const onLoggedInFns = this.onSuccessLoginSlot.values();
          onLoggedInFns.forEach((fn) => fn({ username, token: token as string }));
          return res;
        } catch (err) {
          this.logger.error(`Error on login: ${err}`);
          res.status(CloudMain.ERROR_RESPONSE).send('Login failed');
          reject(err);
          return res;
        }
      });
    });
  }

  registerOnSuccessLogin(onSuccessLoginFn: OnSuccessLogin) {
    this.onSuccessLoginSlot.register(onSuccessLoginFn);
    return this;
  }

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

  getLoginPort(): number {
    return this.config.loginPort || CloudMain.DEFAULT_PORT;
  }

  isLoggedIn(): boolean {
    return Boolean(this.getAuthToken());
  }

  getAuthToken() {
    const processToken = globalFlags.token;
    const token = processToken || this.globalConfig.getSync(CFG_USER_TOKEN_KEY);
    if (!token) return null;

    return token;
  }

  getAuthHeader() {
    return {
      Authorization: `Bearer ${this.getAuthToken()}`,
    };
  }

  async getCurrentUser(): Promise<CloudUser | null> {
    const isLoggedIn = this.isLoggedIn();
    if (!isLoggedIn) {
      return null;
    }
    const route = 'user/user';
    this.logger.debug(`getCurrentUser, url: ${this.getCloudApi()}/${route}`);
    const url = `https://${this.getCloudApi()}/${route}`;
    const opts = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeader(),
      },
    };

    return fetch(url, opts)
      .then(async (res) => {
        if (res.status === 401) {
          return null;
        }
        const response: CloudUserAPIResponse = await res.json();
        return { ...(response.payload || {}) };
      })
      .catch((err) => {
        this.logger.error(`failed to get current user, err: ${err}`);
        return null;
      });
  }

  getUsername(): string | undefined {
    return this.globalConfig.getSync(CFG_USER_NAME_KEY);
  }

  getLoginUrl({
    redirectUrl,
    machineName,
    cloudDomain,
    port,
  }: { redirectUrl?: string; machineName?: string; cloudDomain?: string; port?: string } = {}): string {
    const loginUrl = cloudDomain || this.getLoginDomain();
    if (redirectUrl) {
      CloudMain.REDIRECT_URL = redirectUrl;
    }
    return encodeURI(
      `${loginUrl}?port=${port || this.getLoginPort()}&clientId=${CloudMain.CLIENT_ID}&responseType=token&deviceName=${
        machineName || os.hostname()
      }&os=${process.platform}`
    );
  }

  logout() {
    this.globalConfig.delSync(CFG_USER_TOKEN_KEY);
    this.globalConfig.delSync(CFG_USER_NAME_KEY);
  }

  async whoami(): Promise<string | undefined> {
    const currentUser = await this.getCurrentUser();
    if (!currentUser?.username) {
      return undefined;
    }
    return currentUser.username;
  }

  async login(
    port?: string,
    suppressBrowserLaunch?: boolean,
    machineName?: string,
    cloudDomain?: string
  ): Promise<{
    isAlreadyLoggedIn?: boolean;
    username?: string;
    token?: string;
  } | null> {
    return new Promise((resolve, reject) => {
      this.registerOnSuccessLogin((loggedInParams) => {
        resolve({
          username: loggedInParams.username,
          token: loggedInParams.token,
        });
      });
      if (this.isLoggedIn()) {
        resolve({
          isAlreadyLoggedIn: true,
          username: this.globalConfig.getSync(CFG_USER_NAME_KEY),
          token: this.globalConfig.getSync(CFG_USER_TOKEN_KEY),
        });
      }
      const promptLogin = () => {
        const loginUrl = this.getLoginUrl({
          machineName,
          cloudDomain,
          port,
        });
        if (!suppressBrowserLaunch) {
          console.log(chalk.yellow(`Your browser has been opened to visit:\n${loginUrl}`)); // eslint-disable-line no-console
          open(loginUrl).catch((err) => {
            this.logger.error(`failed to open browser on login, err: ${err}`);
            reject(err);
          });
        } else {
          console.log(chalk.yellow(`Go to the following link in your browser::\n${loginUrl}`)); // eslint-disable-line no-console
        }
      };
      try {
        this.setupAuthListener({
          port: Number(port),
        })
          .then(promptLogin)
          .catch((e) => reject(e));
      } catch (err) {
        reject(err);
      }
    });
  }

  static GET_SCOPES = `
      query GET_SCOPES($ids: [String]!) {
        getScopes(ids: $ids) {
          scopeStyle {
            icon
            backgroundIconColor
            stripColor
          }
        }
      }
    `;

  async getCloudScopes(scopes: string[]): Promise<ScopeDescriptor[]> {
    const remotes = await this.scope._legacyRemotes();
    const filteredScopesToFetch = scopes.filter((scope) => {
      return remotes.isHub(scope);
    });
    const queryResponse = await this.fetchFromSymphonyViaGQL<GetScopesGQLResponse>(CloudMain.GET_SCOPES, {
      ids: filteredScopesToFetch,
    });
    const scopesFromQuery = queryResponse?.data?.getScopes;
    if (!scopesFromQuery) return [];
    return scopesFromQuery.map((scope, index) => {
      const scopeDescriptorObj = {
        ...scope,
        id: ScopeID.fromString(filteredScopesToFetch[index]),
      };
      return ScopeDescriptor.fromObject(scopeDescriptorObj);
    });
  }

  async fetchFromSymphonyViaGQL<T>(query: string, variables?: Record<string, any>): Promise<T | null> {
    if (!this.isLoggedIn()) return null;
    const graphqlUrl = `https://${this.getCloudApi()}${CloudMain.GRAPHQL_ENDPOINT}`;
    const body = JSON.stringify({
      query,
      variables,
    });
    const headers = {
      'Content-Type': 'application/json',
      ...this.getAuthHeader(),
    };
    try {
      const response = await fetch(graphqlUrl, {
        method: 'POST',
        headers,
        body,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      this.logger.debug('fetchFromSymphonyViaGQL. ', 'Error fetching data: ', error);
      return null;
    }
  }

  static slots = [Slot.withType<OnSuccessLogin>()];
  static dependencies = [
    LoggerAspect,
    GraphqlAspect,
    ExpressAspect,
    WorkspaceAspect,
    ScopeAspect,
    GlobalConfigAspect,
    CLIAspect,
  ];
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
    loginPort: CloudMain.DEFAULT_PORT,
  };
  static async provider(
    [loggerMain, graphql, express, workspace, scope, globalConfig, cli]: [
      LoggerMain,
      GraphqlMain,
      ExpressMain,
      Workspace,
      ScopeMain,
      GlobalConfigMain,
      CLIMain
    ],
    config: CloudWorkspaceConfig,
    [onSuccessLoginSlot]: [OnSuccessLoginSlot]
  ) {
    const logger = loggerMain.createLogger(CloudAspect.id);
    const cloudMain = new CloudMain(config, logger, express, workspace, scope, globalConfig, onSuccessLoginSlot);
    const loginCmd = new LoginCmd(cloudMain);
    const logoutCmd = new LogoutCmd(cloudMain);
    const whoamiCmd = new WhoamiCmd(cloudMain);
    cli.register(loginCmd, logoutCmd, whoamiCmd);
    graphql.register(cloudSchema(cloudMain));
    if (workspace) await cloudMain.setupAuthListener();
    return cloudMain;
  }
}

CloudAspect.addRuntime(CloudMain);
