import { EnvContext, EnvHandler } from "@teambit/envs";
import { ApplicationType } from "./application-type";

export type AppTypeListOptions = {
  name?: string;
};

export class AppTypeList {
  constructor(
    readonly name: string,
    private appTypes: EnvHandler<ApplicationType<any>>[],
    private context: EnvContext
  ) {}

  compute(): ApplicationType<any>[] {
    return this.appTypes.map((appType) => appType(this.context))
  }

  static from(appTypes: EnvHandler<ApplicationType<any>>[], options: AppTypeListOptions = {}): EnvHandler<AppTypeList> {
    return (context: EnvContext) => {
      const name = options.name || 'app-type-list';
      return new AppTypeList(name, appTypes, context);
    };
  }
}
