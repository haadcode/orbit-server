'use strict';

var _            = require('lodash');
var aerospike    = require('aerospike');
var Promise      = require('bluebird');
var logger       = require('../logger');

class Channel {
  constructor(hash) {
    this.key  = aerospike.key("test", "demo5", hash);
    this.hash = hash;
    this.head = null;
    this.seq  = -1;
    this.ops  = [];
    this.readPassword  = '';
    this.writePassword = '';
    this.modes = {};
  }

  init(client) {
    return new Promise((resolve, reject) => {
      this.client = client;
      this.client.get(this.key, (err, record, metadata) => {
        if(err && err.code == 0 && err.message == 'AEROSPIKE_ERR_RECORD_NOT_FOUND')
          err = null;

        if(err && err.code != 0 && err.code != 2) {
        // if(err && err.code != 0) { //} && err.code != 2) {
          // 2 == 'AEROSPIKE_ERR_RECORD_NOT_FOUND'
          logger.debug("Exception:", err);
          logger.debug("Key:", this.hash);
          reject(err);
          // err = null;
        }

        this.head  = record.head  || null;
        this.seq   = record.seq   || -1;
        this.modes = record.modes || {};
        this.ops   = record.ops   || [];

        resolve(this);
      });
    });
  }

  delete() {
    return new Promise((resolve, reject) => {
      this.client.remove(this.key, resolve);
    });
  }

  updateHead(headHash, callback) {
    return new Promise((resolve, reject) => {
      if(!this.modes.r) this.modes.r = {};
      this.head = headHash;
      this.seq  = this.seq + 1;
      this._saveHead(resolve);
    });
  }

  setMode(modes, params, callback) {
    return new Promise((resolve, reject) => {
      modes.forEach((m) => {
        let mode   = m.mode;
        let params = m.params;
        if(mode === "+r") {
          if(params.password !== undefined && params.password === '') {
            delete this.modes.r;
          } else {
            if(!this.modes.r) this.modes.r = {};
            this.modes.r = Object.assign(this.modes.r, params);
          }
        } else if(mode === "-r") {
          if(this.modes.r) delete this.modes.r;
        } else if(mode === "+w") {
          if(!this.modes.w) this.modes.w = { ops: [] };
          this.modes.w.ops = _.unique(this.modes.w.ops.concat(params.ops));
        } else if(mode === "-w" && this.modes.w) {
          if(params && params.ops)
            params.ops.forEach((op) => this.modes.w.ops = _.without(this.modes.w.ops, op))
          else
            delete this.modes.w
        }
      });
      this._saveModes(resolve);
    });
  }

  isSecret() {
    return this.modes.r !== undefined;
  }

  isModerated() {
    return this.modes.w !== undefined;
  }

  /* Authentication */
  authenticateRead(password) {
    if(this.seq === -1 && !this.isSecret())
      return; // new channel

    if(this.isSecret() && this.modes.r.password !== password)
      throw "Unauthorized";

    if(this.readPassword && this.readPassword !== '' && this.readPassword !== password)
      throw "Unauthorized";

    return;
  }

  authenticateWrite(uid) {
    if(this.seq === -1 && !this.isModerated())
      return; // new channel

    if(this.isModerated() && !_.contains(this.modes.w.ops, uid))
      throw "Unauthorized";

    return;
  }

  /* Private */

  _saveHead(done) {
    var bins = { head: this.head, seq: this.seq };
    this.client.put(this.key, bins, null, { retry: aerospike.policy.retry.ONCE, timeout: 2000 }, (err, key) => {
      if(err && err.code != 0) logger.error("_saveHead error:", err);
      done();
    });
  }

  _saveModes(done) {
    var bins = { head: this.head, seq: this.seq, modes: this.modes };
    this.client.put(this.key, bins, (err, key) => {
      if(err && err.code != 0) logger.error("_saveMode error:", err);
      done();
    });
  }

}

module.exports = Channel;
