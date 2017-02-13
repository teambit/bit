export default class InvalidBitJsonException extends Error {
  constructor(e, pathToBitJson) {
    super(`bit.json file is invalid at ${pathToBitJson}
    
    ${e.message}
    `);
    this.name = 'InvalidBitJsonException';
    this.code = 'INVALJSON';
  }
}
