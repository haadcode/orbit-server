'use strict';

var crypto     = require('crypto');
var Base58     = require('bs58');
var Encryption = require('orbit-client/src/Encryption');

class User {
  constructor(username, password, salt, networkId) {
    this.username  = username;
    this.hash      = User.createUserHash(this.username, salt);
    this.password  = Encryption.hashWithSHA512(password, "" + salt)
    this.networkId = networkId;
    this.salt      = salt;
  }

  get() {
    return {
      user: this.username,
      networkId: this.networkId
    }
  }

  static createUserHash(username, salt) {
    return Base58.encode(crypto.createHash('sha256').update(salt + "." + username).digest());
  }
}

module.exports = User;