export interface UseExtenderFunction {
  (
    /**
     * relevant config for the extender
     */
    vendorConfig: any, // Record<string, any>, for some reason Record<string, any> doesnt like the function to use required parameters in 'any'...?
    /**
     * options used by environment to process the vendor configs. To be defined per environment
     */
    options: any,
    /**
     * vendor module, supplied as an override to the environment's default module version
     */
    module: any
  );
}
