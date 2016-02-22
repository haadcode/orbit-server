'use strict';

const io = require('socket.io-client');
var socket = io('http://localhost:3333');

let connected = false;

let subscriptions = {};

let channel = process.argv[2] ? process.argv[2] : 'default channel';
let prefix  = process.argv[3] ? process.argv[3] : 'hello ';

socket.on('connect', function (s) {
  console.log('connected')
  connected = true;
  socket.emit('subscribe', { channel: channel });
});

socket.on('message', function (event) {
  console.log('>>>', event)
});

let count = 1;

setInterval(() => {
  if(connected) {
    socket.send({ channel: channel, message: prefix + count });
    count ++;
  }
}, 1000);
