var assert     = require('assert');
var request    = require('supertest');
var fs         = require('fs');
var path       = require('path');
var async      = require('asyncawait/async');
var await      = require('asyncawait/await');
var Promise    = require('bluebird');
var ipfsDaemon = require('orbit-common/lib/ipfs-daemon');
var Keystore   = require('orbit-common/lib/Keystore');
var logger     = require('orbit-common/lib/logger');
var utils      = require('orbit-common/lib/utils');
var Server     = require('../src/server');
var User       = require('../src/User');

var pubkey  = Keystore.getKeys().publicKey;
var privkey = Keystore.getKeys().privateKey;

var serverConfig = {
  networkId: "anon-test",
  networkName: "Anonymous Networks TEST",
  salt: "thisisthenetworksalt",
  userDataPath: path.resolve("./anon-server-tests"),
  verifyMessages: false // TODO: set to true and verify messages in the tests
}

// Create the userDataPath in case it doesn't exist
if(!fs.existsSync(serverConfig.userDataPath))
  fs.mkdirSync(serverConfig.userDataPath);

var username  = 'test';
var password  = 'test123';
var userHash  = 'QmbhkmmrwNFCZK79o1fnUaSstFxyacJqRKCMEAUbzDJ7uE';

var user  = new User(username, password, serverConfig.salt, serverConfig.networkId);
var user2 = new User('nonop', 'test', serverConfig.salt, serverConfig.networkId);

var credentials      = "Basic " + user.username + "=" + password;
var falseCredentials = "Basic " + user.username + "=" + user.password + "22222222";
var nonopCredentials = "Basic " + user2.username + "=" + user2.password;

var invalidRequestError     = { status: "error", message: "Invalid request" };
var invalidCredentialsError = { status: "error", message: "Invalid credentials" };
var unauthorizedError       = { status: "error", message: "Unauthorized" };
var invalidPasswordError    = { status: "error", message: "Invalid username or password" };

const startServer = async (() => {
  return new Promise(async((resolve, reject) => {
    const ipfsd  = await(ipfsDaemon());
    const server = Server(ipfsd.daemon, ipfsd.nodeInfo, serverConfig);
    resolve(server);
  }));
});

describe('Network Server', async(() => {
  var agent, app, server;

  before(async((done) => {
    logger.setLevel('ERROR');
    server = await(startServer());
    app    = server.app;
    agent  = request.agent(app);
    done();
  }));

  after(function(done) {
    server.shutdown();
    done();
  });

  const loginSuccessful = (res) => {
    const info = res.body;
    assert.equal(info.networkId, serverConfig.networkId);
    assert.equal(info.name, serverConfig.networkName);
    assert.notEqual(info.config.SupernodeRouting.Servers.length, 0);
    assert.notEqual(info.config.Bootstrap, 0);
    assert.equal(info.user.id, userHash);
    assert.equal(info.user.username, username);
  };

  /* TESTS */
  describe('Initialize server', function() {
    it('returns an app and the server config', function(done) {
      this.timeout(1000);
      assert.notEqual(app, null);
      assert.equal(server.config.networkId, serverConfig.networkId)
      assert.equal(server.config.networkName, serverConfig.networkName)
      assert.equal(server.config.salt, serverConfig.salt)
      done();
    });

    it('does not return an app if ipfs is null', function(done) {
      var app = Server(null);
      assert.equal(app, null);
      done();
    });
  });

  describe('index', () => {
    it('returns an empty object from index', function(done) {
      agent
        .get('/')
        .expect(200)
        .expect({}, done)
    });
  });

  describe('register', () => {
    it('returns 200 for a new user', (done) => {
      agent
        .post('/register')
        .set('Authorization', credentials)
        .expect(200)
        .expect(loginSuccessful)
        .end(done)
    });

    it('returns 200 for an existing user with right password', (done) => {
      agent
        .post('/register')
        .set('Authorization', credentials)
        .expect(200)
        .expect(loginSuccessful)
        .end(done)
    });

    it('returns 403 if authorization header is missing', (done) => {
      agent
        .post('/register')
        .expect(403)
        .expect(invalidCredentialsError, done)
    });

    it('returns 403 for an existing user with wrong password', (done) => {
      agent
        .post('/register')
        .set('Authorization', falseCredentials)
        .expect(403)
        .expect(invalidPasswordError, done)
    });

    it('writes a data file for a new user', (done) => {
      var file = path.resolve(serverConfig.userDataPath, user.hash + ".json");
      agent
        .post('/register')
        .set('Authorization', credentials)
        .expect(200, () => {
          assert.equal(fs.existsSync(file), true);
          var content = fs.readFileSync(file, "UTF-8");
          assert.equal(content, '{"userId":"2satBMKpuvULxJLyHHNcXbxrigf4tvrKhK8NZvfRtu8b","password":"502899591b33afdd0c0c3f26ea1a0858d1ebe98a3696aae39f8e543e9ce30e45694628bfb0a77937e1bf346abfa1116dbc09c456b84e8e3cdbd83ade910a7316","networkId":"anon-test"}');
          done();
        })
    });

    it('fails authentication with spoofed network id in the data file', (done) => {
      var file = path.resolve(serverConfig.userDataPath, user.hash + ".json");
      var spoofedContent = '{"userId":"2satBMKpuvULxJLyHHNcXbxrigf4tvrKhK8NZvfRtu8b","password":"3330e7f396b5a9695c4b711a60d29b836a26da46e4616db104e1d1f425eba589f9c18893e809d15195fbd900c024764ad70980b4940dcee084ccb91eff924c14","networkId":"anon-test-spoofed"}';
      fs.writeFileSync(file, spoofedContent);
      agent
        .post('/register')
        .set('Authorization', credentials)
        .expect(403)
        .expect({ status: "error", message: "Invalid username or password"}, () => {
          fs.unlinkSync(file);
          done();
        })
    });
  });

  describe('channel', () => {
    var hash     = new Date().getTime();
    var headHash = 'abc';

    // var database = await server.connect(host, { username: 'username', password: 'password' })
    it('gets an access to the database', (done) => {
      agent
        .post('/register')
        .set('Authorization', credentials)
        .expect(loginSuccessful)
        .end(done)
    });

    describe('reading', () => {
      // var hash = await database.linkedList('name', 'passphrase').head
      it('returns channel head', (done) => {
        agent
          .get('/channel/' + hash)
          .set('Authorization', credentials)
          .expect({ head: null, modes: {} })
          .expect(200, done)
      });

      it('doesn not return channel head without credentials', (done) => {
        agent
          .get('/channel/' + hash)
          .expect(invalidRequestError)
          .expect(403, done)
      });
    });

    describe('writing', () => {
      // var newHead = await database.linkedList('name', 'passphrase').add('ipfs-hash-of-new-head')
      it('adds an element', (done) => {
        agent
          .put('/channel/' + hash + '/add')
          .set('Authorization', credentials)
          .send({ head: headHash })
          .expect({ head: headHash })
          .expect(200, done)
      });

      it('can not add an element without credentials', (done) => {
        agent
          .put('/channel/' + hash + '/add')
          .send({ head: headHash })
          .expect(invalidRequestError)
          .expect(403, done)
      });

      it('can not add an element without head', (done) => {
        agent
          .put('/channel/' + hash + '/add')
          .set('Authorization', credentials)
          .send({ random: 'value' })
          .expect(invalidRequestError)
          .expect(403, done)
      });

      it('can not add null as the head', (done) => {
        agent
          .put('/channel/' + hash + '/add')
          .set('Authorization', credentials)
          .send({ head: null })
          .expect(invalidRequestError)
          .expect(403, done)
      });

      it('can delete the channel', (done) => {
        agent
          .delete('/channel/' + hash)
          .set('Authorization', credentials)
          .expect({})
          .expect(200, done)
      });
    });

    describe('modes', () => {
      before((done) => {
        agent
          .put('/channel/' + hash + '/add')
          .set('Authorization', credentials)
          .send({ head: headHash })
          .expect({ head: headHash })
          .expect(200, done)
      });

      // var modes = await database.linkedList('name').modes
      it('returns modes', (done) => {
        agent
          .get('/channel/' + hash)
          .set('Authorization', credentials)
          .expect({ head: headHash, modes: {} })
          .expect(200, done)
      });

      // var newModes = await database.linkedList('name').setMode('+r', { password: 'passphrase' })
      describe('secret mode', () => {
        it('sets a secret mode', (done) => {
          agent
            .post('/channel/' + hash)
            .set('Authorization', credentials)
            .send({ modes: [{ mode: '+r', params: { password: 'test123' }}], password: 'test123' })
            .expect({ modes: { 'r': { password: 'test123' } }})
            .expect(200, done)
        });

        it('updates modes', (done) => {
          agent
            .post('/channel/' + hash)
            .set('Authorization', credentials)
            .send({ modes: [{ mode: '+r', params: { password: '456', custom: 'value' }}], password: 'test123' })
            .expect({ modes: { 'r': { password: '456', custom: 'value' } }})
            .expect(200, done)
        });

        it('does not update modes without password', (done) => {
          agent
            .post('/channel/' + hash)
            .set('Authorization', credentials)
            .send({ modes: [{ mode: '+r', params: { password: '456', custom: 'value' } }] })
            .expect(unauthorizedError)
            .expect(403, done)
        });

        it('returns modes', (done) => {
          agent
            .get('/channel/' + hash)
            .set('Authorization', credentials)
            .send({ password: '456' })
            .expect({ head: headHash, modes: { 'r': { password: '456', custom: 'value' } }})
            .expect(200, done)
        });

        it('can not update channel head after read password change', (done) => {
          agent
            .put('/channel/' + hash + '/add')
            .set('Authorization', credentials)
            .send({ head: headHash })
            .expect(unauthorizedError)
            .expect(403, done)
        });

        it('can not read channel head after read password change', (done) => {
          agent
            .get('/channel/' + hash)
            .set('Authorization', credentials)
            .expect(unauthorizedError)
            .expect(403, done)
        });

        it('removes secret mode', (done) => {
          agent
            .post('/channel/' + hash)
            .set('Authorization', credentials)
            .send({ modes: [{ mode: '-r' }], password: '456' })
            .expect({ modes: {} })
            .expect(200, done)
        });

        it('updated modes after a change', (done) => {
          agent
            .get('/channel/' + hash)
            .set('Authorization', credentials)
            .expect({ head: headHash, modes: {} })
            .expect(200, done)
        });
      });

      describe('moderation mode', () => {
        it('sets moderation mode', (done) => {
          agent
            .post('/channel/' + hash)
            .set('Authorization', credentials)
            .send({ modes: [{ mode: '+w', params: { ops: [userHash] } }] })
            .expect({ modes: { w: { ops: [userHash] }} })
            .expect(200, done)
        });

        it('adds a moderator', (done) => {
          agent
            .post('/channel/' + hash)
            .set('Authorization', credentials)
            .send({ modes: [{ mode: '+w', params: { ops: ['test2'] } }] })
            .expect({ modes: { w: { ops: [userHash, 'test2'] }} })
            .expect(200, done)
        });

        it('adds an element after setting write mode', (done) => {
          agent
            .put('/channel/' + hash + '/add')
            .set('Authorization', credentials)
            .send({ head: headHash })
            .expect({ head: headHash })
            .expect(200, done)
        });

        it('prevents non-moderator adding elements after setting write mode', (done) => {
          agent
            .put('/channel/' + hash + '/add')
            .set('Authorization', nonopCredentials)
            .send({ head: headHash })
            .expect(unauthorizedError)
            .expect(403, done)
        });

        it('adds a moderator', (done) => {
          agent
            .post('/channel/' + hash)
            .set('Authorization', credentials)
            .send({ modes: [{ mode: '+w', params: { ops: ['test2'] } }] })
            .expect({ modes: { w: { ops: [userHash, 'test2'] }} })
            .expect(200, done)
        });

        it('removes a moderator', (done) => {
          agent
            .post('/channel/' + hash)
            .set('Authorization', credentials)
            .send({ modes: [{ mode: '-w', params: { ops: ['test2']} }] })
            .expect({ modes: { w: { ops: [userHash] }} })
            .expect(200, done)
        });

        it('removes moderation mode', (done) => {
          agent
            .post('/channel/' + hash)
            .set('Authorization', credentials)
            .send({ modes: [{ mode: '-w' }] })
            .expect({ modes: {} })
            .expect(200, done)
        });
      });
    });

  });

  after(function(done) {
    var rmDir = function(dirPath) {
      try { var files = fs.readdirSync(dirPath); }
      catch(e) { return; }
      if (files.length > 0)
        for (var i = 0; i < files.length; i++) {
          var filePath = dirPath + '/' + files[i];
          if (fs.statSync(filePath).isFile())
            fs.unlinkSync(filePath);
          else
            rmDir(filePath);
        }
      fs.rmdirSync(dirPath);
    };

    rmDir(serverConfig.userDataPath);
    done();
  });

}));
