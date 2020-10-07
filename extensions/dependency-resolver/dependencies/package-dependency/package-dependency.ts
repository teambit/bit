import { BaseDependency } from '../base-dependency';
import { SerializedDependency, Dependency } from '../dependency';

export interface SerializedPackageDependency extends SerializedDependency {}

export class PackageDependency extends BaseDependency implements Dependency {}
