'use strict';

const io = require('socket.io')(3333);
const redis = require("redis");
const adapter = require('socket.io-redis');

const host = 'localhost'
const port = process.env.REDIS_PORT ? process.env.REDIS_PORT : 6379;

let pub = redis.createClient({ host: host, port: port, auth_pass: process.env.REDIS_PASSWORD });
let sub = redis.createClient({ host: host, port: port, auth_pass: process.env.REDIS_PASSWORD });

io.adapter(adapter({ pubClient: pub, subClient: sub }));

sub.on('message', (channel, data) => {
  io.sockets.in(channel).emit('message', channel, data);
});

io.on('connection', function (socket) {
  console.log("Client connected from", socket.request.connection._peername);

  socket.on('subscribe', function (event) {
    sub.subscribe(event.channel);
    socket.join(event.channel);
    console.log("Client joined channel", event.channel);

    socket.on('message', function (event) {
      pub.publish(event.channel, event.message);
    });
  });

  socket.on('unsubscribe', function (event) {
    socket.leave(event.channel);
    console.log("Client left channel", event.channel);
  });

  socket.on('disconnect', function () {
  });
});

console.log("Started");