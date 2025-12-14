import type { EnvDefinition } from './env-definition';
import type { EnvService } from './services';

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

  async toObject() {
    return {
      env: this.env.toObject(),
      services: await Promise.all(
        this.services.map(async ([id, service]) => {
          return {
            id,
            name: service.name,
            description: service.description,
            // @ts-ignore
            data: await service.getDescriptor(this.env),
          };
        })
      ),
    };
  }
}
