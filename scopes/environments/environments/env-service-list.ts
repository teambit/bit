import { EnvDefinition } from './env-definition';
import { EnvService } from './services';

export class EnvServiceList {
  constructor(
    /**
     * environment
     */
    readonly env: EnvDefinition,

    /**
     * services available on the env.
     */
    readonly services: [string, EnvService<any>][]
  ) {}

  toObject() {
    return {
      env: this.env.toObject(),
      services: this.services.map(([id, service]) => {
        return {
          id,
          name: service.name,
          description: service.description,
          // @ts-ignore
          data: service.getDescriptor(this.env),
        };
      }),
    };
  }
}
