'use strict';

var _            = require('lodash');
var aerospike    = require('aerospike');
var EventEmitter = require('events').EventEmitter;
var async        = require('asyncawait/async');
var await        = require('asyncawait/await');
var Promise      = require('bluebird');
var Channel      = require('./models/Channel');
var logger       = require('./logger');

/* DB */
var events = new EventEmitter();
var client = aerospike.client({
  hosts: [ { addr: '127.0.0.1', port: 3000 } ]
});

function onConnected(err, client) {
  if (err.code == aerospike.status.AEROSPIKE_OK) {
    logger.debug("Aerospike Connection Success");
    events.emit('connected');
  } else {
    logger.error("Failed to connect to Aerospike");
    events.emit('error', null);
  }
}

module.exports = {
  events: events,
  connect: async(() => {
    var connect = Promise.promisify((cb) => {
      client.connect((err, client) => {
        if (err.code == aerospike.status.AEROSPIKE_OK) {
          logger.debug("Connected to Aerospike");
          events.emit('connected');
          cb(null, null);
        } else {
          logger.error("Failed to connect to Aerospike:\n", err);
          cb(err, null);
        }
      });
    });
    await(connect());
    return;
  }),
  getChannel: async((hash) => {
    var c = new Channel(hash);
    var channel = await(c.init(client));
    return channel;
  })
};
