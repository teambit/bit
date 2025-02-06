const fs = require('fs');
const builtinCrypto = require('crypto');
const algorithm = 'aes-192-cbc';
const password = 'Password used to generate key';

// Key length is dependent on the algorithm. In this case for aes192, it is
// 24 bytes (192 bits).
// Use async `crypto.scrypt()` instead.
const key = builtinCrypto.scryptSync(password, 'salt', 24);

// Get the iv: the first 16 bytes
// const iv = chunk.slice(0, 16);
const iv = Buffer.alloc(16, 0);

function encrypt(chunk) {
  var cipher,
    result,
    // Create a new cipher
    cipher = builtinCrypto.createCipheriv(algorithm, key, iv);

  // Create the new chunk
  result = Buffer.concat([iv, cipher.update(chunk), cipher.final()]);

  return result;
}

function decrypt(chunk) {
  var decipher,
    result,
    // Get the rest
    chunk = chunk.slice(16);

  // Create a decipher
  decipher = builtinCrypto.createDecipheriv(algorithm, key, iv);

  // Actually decrypt it
  result = Buffer.concat([decipher.update(chunk), decipher.final()]);

  return result;
}

function onPersist(content) {
  // Do some side effect for testing purpose
  console.log('on persist run');
  // fs.writeFileSync('./on-persist.txt', 'on persist run');
  return encrypt(content);
}

function onRead(content) {
  console.log('on read run');
  // Do some side effect for testing purpose
  // fs.writeFileSync('./on-read.txt', 'on read run');
  return decrypt(content);
}

module.exports = {
  onPersist,
  onRead
};

// That's here for debug purpose
// var hw = encrypt(Buffer.from("hello world", "utf8"))
// outputs hello world
// console.log(decrypt(hw).toString('utf8'));
