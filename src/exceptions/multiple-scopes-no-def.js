export default class MultipleScopesNoDefException extends Error {
  constructor(directoryToLookIn) {
    super(`there are multiple scopes for the component in "${directoryToLookIn}", please specify the component id in the relevant bit.json
    `);
    this.name = 'MultipleScopesNoDefException';
    this.code = 'MULTSCOPNODF';
  }
}
