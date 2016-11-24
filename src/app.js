/** @flow */
import registerCommands from './cli/command-registrar-builder';

const registrar = registerCommands();
registrar.run();
