'use strict';

const OrbitServer = require('./server.js');
try {
  OrbitServer.start();
} catch(e) {
  console.error(e);
}
