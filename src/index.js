'use strict';

var fs         = require('fs');
var path       = require('path');
var async      = require('asyncawait/async');
var await      = require('asyncawait/await');
var ipfsDaemon = require('orbit-client/src/ipfs-daemon');
var server     = require('./server');
var logger     = require('./logger');
var utils      = require('./utils');

require('http').globalAgent.maxSockets = Infinity;

const port = 3006;
const serverConfig = {
  networkId: "anon-test",
  networkName: "Anonymous Networks TEST",
  salt: "thisisthenetworksalt",
  userDataPath: path.resolve(process.cwd(), "users/"),
  enableMetrics: false,
  metricsInterval: 60000
}

if(!fs.existsSync(path.resolve(process.cwd(), "./users")))
  fs.mkdirSync(path.resolve(process.cwd(), "./users"));

const startService = async (() => {
  return new Promise(async((resolve, reject) => {
    const ipfsd = await(ipfsDaemon());
    server = server(ipfsd.daemon, ipfsd.nodeInfo, serverConfig);
    resolve(server.app);
  }));
});

const main = async((callback) => {
  const app = await(startService());
  app.listen(port, () => {
    logger.info('orbit-server listening at http://localhost:%s', port);
    if(callback) callback();
  });
})();

module.exports = main;
