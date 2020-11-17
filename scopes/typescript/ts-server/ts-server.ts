export class TSServer {
  // constructor(
  // private process: TSServerProc
  // ) {}
  /**
   * get the tsserver project info.
   */
  getProjectInfo() {
    // this.process.write({
    //   seq: 0,
    //   type: 'request',
    //   command: 'configure',
    //   arguments: {
    //     hostInfo: 'vscode',
    //     preferences: {
    //       providePrefixAndSuffixTextForRename: true,
    //       allowRenameOfImportPath: true,
    //     },
    //   },
    // });
    // this.process.kill();
  }

  static async create() {
    // const options = {
    //   tsServerPath: '/Users/ranmizrahi/Bit/harmony-review',
    //   args: [
    //     '--useInferredProjectPerProjectRoot',
    //     '--enableTelemetry',
    //     '--noGetErrOnBackgroundUpdate',
    //     // '--validateDefaultNpmLocation',
    //   ],
    // };
    // const tsServer = new TsServerProcess(options);
    // tsServer.on('data', (data) => {
    //   console.log(data);
    // });
    // return new TSServer(tsServer);
  }
}
