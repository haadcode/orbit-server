'use strict';

var _              = require('lodash');
var fs             = require('fs');
var path           = require('path');
var express        = require('express');
var app            = express()
var bodyParser     = require('body-parser');
var async          = require('asyncawait/async');
var await          = require('asyncawait/await');
var Database       = require('./database');
var DatabaseEvents = Database.events;
var ipfsAPI        = require('orbit-common/lib/ipfs-api-promised');
var Encryption     = require('orbit-common/lib/Encryption');
var Keystore       = require('orbit-common/lib/Keystore');
var logger         = require('orbit-common/lib/logger');
var utils          = require('orbit-common/lib/utils');
var User           = require('./User');
var Metrics        = require('./metrics');

// var http           = require('http');
// http.globalAgent.maxSockets = 1;

// logger.setLevel('WARN');

var pubkey  = Keystore.getKeys().publicKey;
var privkey = Keystore.getKeys().privateKey;

var config = {
  networkId: "anon-dev",
  networkName: "Anonymous Networks DEV",
  salt: "thisisthenetworksalt",
  userDataPath: path.resolve(__dirname, 'users/'),
  verifyMessages: true
}

var addresses = {
  "SupernodeRouting": {
    "Servers": []
  },
  "Bootstrap": []
}

var serverAddresses = [];

var invalidRequestError = { status: "error", message: "Invalid request" };
var unauthorizedError   = { status: "error", message: "Unauthorized" };

var ipfs;

var authenticate = async((user) => {
  return new Promise((resolve, reject) => {
    var file = path.resolve(config.userDataPath, user.hash + ".json");
    fs.readFile(file, (err, data) => {
      if(err) {
        reject(err.toString());
        return;
      }

      if(data) {
        var credentials = JSON.parse(data);
        if(user.hash != credentials.userId || user.password != credentials.password || credentials.networkId != user.networkId)
          reject("Invalid username or password");
        else
          resolve(true)
      } else {
        reject(err.toString())
      }
    });
  });
});

var userExists = (user) => {
  var file = path.resolve(config.userDataPath, user.hash + ".json");
  return fs.existsSync(file);
};

function createUser(user) {
  fs.writeFileSync(path.resolve(config.userDataPath, user.hash + ".json"), JSON.stringify({
    userId: user.hash,
    password: user.password,
    networkId: config.networkId
  }));
};

function parseCredentials(req) {
  if(!req.headers['authorization'])
    return;

  try {
    var kp = req.headers['authorization'].split(' ')[1].split('=')
    var username = kp[0];
    var password = kp[1];
    return { username: username, password: password };
  } catch(e) {
    return;
  }
};

function authorize(req, res) {
  var credentials;
  credentials = parseCredentials(req);
  if(!credentials)
    throw "Invalid request";

  var user = new User(credentials.username, credentials.password, config.salt, config.networkId);
  try {
    if(userExists(user))
      await(authenticate(user));
    else
      throw "Unauthorized";
  } catch(e) {
    throw "Unauthorized";
  }

  return user;
};

var verifyMessage = async((hash, channel) => {
  if(!config.verifyMessages)
    return true;

  var message, verified = false;
  try {
    message = await (ipfsAPI.getObject(ipfs, hash));
    message = JSON.parse(message.Data);

    if(message.seq <= channel.seq)
      throw `Wrong sequence (message: ${message.seq}, channel: ${channel.seq})`;

    let payload = message.target ? message.target : message.payload; // compatibility with Orbit's old data structure
    verified = Encryption.verify(payload, message.pubkey, message.sig, message.seq, channel.modes.r ? channel.modes.r.password : '');
  } catch(e) {
    throw "Invalid request: " + e.toString();
  }

  return verified;
});

function handleError(src, res, e) {
  if(e.code === 'ECONNREFUSED') {
    logger.error("-------------------------------------------------\n",
      src + "\n",
      e.code, e.stack ? e.stack.toString() : e.toString(), "\n");
  }

  logger.debug("Invalid request: " + src + ", ", e.code ? e.code : -1, e.stack ? e.stack.toString() : e.toString());
  res.status(403).json({ status: "error", message: e.toString() })
  res.end();
};

// TODO: return peers who called in, not the ipfs swarm peers?
var getBootstrapPeers = async((ipfs) => {
  var peers = await (ipfsAPI.swarmPeers(ipfs));
  return _.take(peers.Strings, 100);
});

app.use(bodyParser.json({ extended: false }));

// Login/Register a user
app.post("/register", async((req, res) => {
  var st = new Date().getTime();
  var credentials = parseCredentials(req);
  if(!credentials) {
    handleError('/register', res, "Invalid credentials");
    return ;
  }

  try {
    Metrics.accumulators.connect += 1;
    var user = new User(credentials.username, credentials.password, config.salt, config.networkId);
    if(userExists(user)) {
      await (authenticate(user));
    } else {
      Metrics.accumulators.newuser += 1;
      createUser(user);
      logger.info('New user:', user.username);
    }

    var peers = await (getBootstrapPeers(ipfs));
    addresses.Bootstrap = serverAddresses;
    addresses.Bootstrap = _.filter(addresses.Bootstrap.concat(peers), (e) => e != null);

    var uid = await (ipfsAPI.putObject(ipfs, JSON.stringify(user.get())));
    ipfsAPI.pinObject(ipfs, uid.Hash).catch((err) => { /* ignore */ })
    logger.info('User connected:', user.username, uid.Hash);
    res.json({
      networkId: config.networkId,
      name: config.networkName,
      config: addresses,
      user: {
        id: uid.Hash,
        username: user.username
      }
    });
    var et = new Date().getTime();
    // console.log(et - st + " ms")
  } catch(e) {
    handleError('/register2', res, e);
  }
}));

// Read channel
app.get("/channel/:hash", async ((req, res) => {
    var st = new Date().getTime();
  try {
    var hash    = req.params.hash
    var user    = authorize(req, res);
    var channel = await(Database.getChannel(hash));
    channel.authenticateRead(req.body.password);
    res.json({ head: channel.head, modes: channel.modes });
  } catch(e) {
    handleError('get /channel', res, e);
  }
    var et = new Date().getTime();
    // console.log("get", et - st + " ms")
}));

// Write channel
app.put("/channel/:hash/add", async ((req, res) => {
    var st = new Date().getTime();
  try {
    Metrics.accumulators.write += 1;
    var hash    = req.params.hash;
    var head    = req.body.head;
    if(!head) throw "Invalid request";
    var user    = authorize(req, res);
    var channel = await(Database.getChannel(hash));
    channel.authenticateRead(req.body.password);
    var uid     = await (ipfsAPI.putObject(ipfs, JSON.stringify(user.get())));
    channel.authenticateWrite(uid.Hash);
    await(verifyMessage(head, channel));
    await(channel.updateHead(head))
    // await(ipfsAPI.pinObject(ipfs, head)) // TODO: uncomment when socket leak is fixed in ipfs.pin.add
    res.json({ head: channel.head })
  } catch(e) {
    handleError('put /channel', res, e)
  }
    var et = new Date().getTime();
    // console.log("put", et - st + " ms")
}))

// Set channel mode
app.post("/channel/:hash", async ((req, res) => {
  try {
    Metrics.accumulators.setMode += 1;
    var hash    = req.params.hash;
    var user    = authorize(req, res);
    var modes   = typeof req.body.modes === 'string' ? [req.body.modes] : req.body.modes;
    if(!modes) throw "Invalid request";
    var channel = await(Database.getChannel(hash))
    channel.authenticateRead(req.body.password);
    var uid     = await (ipfsAPI.putObject(ipfs, JSON.stringify(user.get())));
    channel.authenticateWrite(uid.Hash);
    await (channel.setMode(modes, req.body.params));
    res.json({ modes: channel.modes });
  } catch(e) {
    handleError('post /channel', res, e);
  }
}));

// Reset channel
app.delete("/channel/:hash", async ((req, res) => {
  try {
    var hash    = req.params.hash
    var user    = authorize(req, res);
    var channel = await(Database.getChannel(hash));
    channel.authenticateRead(req.body.password);
    var uid     = await (ipfsAPI.putObject(ipfs, JSON.stringify(user.get())));
    channel.authenticateWrite(uid.Hash);
    await (channel.delete());
    res.json({});
  } catch(e) {
    handleError('delete /channel', res, e);
  }
}));

app.get("/", (req, res) => res.json({}));

/* Module */
module.exports = function(ipfsInstance, ipfsNodeInfo, serverConfig) {
  if(serverConfig)
    Object.assign(config, serverConfig);
  else
    serverConfig = {}

  if(serverConfig.enableMetrics === undefined)
    serverConfig.enableMetrics = false;

  if(serverConfig.metricsInterval === undefined)
    serverConfig.metricsInterval = 60000;

  if(serverConfig.userDataPath && !fs.existsSync(serverConfig.userDataPath))
    fs.mkdirSync(serverConfig.userDataPath);

  if(!ipfsInstance)
    return null;

  ipfs = ipfsInstance;
  addresses.SupernodeRouting.Servers = ipfsNodeInfo.Addresses;
  addresses.Bootstrap = ipfsNodeInfo.Addresses;
  serverAddresses = ipfsNodeInfo.Addresses;
  try {
    Metrics.interval = serverConfig.metricsInterval;
    Metrics.start(serverConfig.enableMetrics);
    await(Database.connect());
  } catch(e) {
    process.exit(1);
  }

  return {
    app: app,
    config: config,
    shutdown: () => {
      Metrics.stop();
    }
  };
}
