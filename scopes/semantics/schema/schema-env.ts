import { EnvHandler } from "@teambit/envs";
import { SchemaExtractor } from "./schema-extractor";

/**
 * define a schema extractor to extract type information
 * and docs for your components.
 */
export interface SchemaEnv {
  schemaExtractor(): EnvHandler<SchemaExtractor>;
}
