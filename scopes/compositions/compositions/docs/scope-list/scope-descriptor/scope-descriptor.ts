export type ScopeDescriptorProps = {
  id: {
    scopeName: string;
    owner: string;
  };
  description: string;
  componentCount: number;
  visibility?: boolean;
};

export class ScopeDescriptor {
  constructor(
    readonly id: string,
    readonly description: string,
    readonly componentCount: number,
    readonly visibility?: boolean
  ) {}

  toObject() {
    return {
      id: this.id,
      description: this.description,
      componentCount: this.componentCount,
      visibility: this.visibility,
    };
  }

  static fromObject(props: ScopeDescriptorProps) {
    return new ScopeDescriptor(
      `${props.id.owner}/${props.id.scopeName}`,
      props.description,
      props.componentCount,
      props.visibility
    );
  }
}
