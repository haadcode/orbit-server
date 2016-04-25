'use strict';

const IO = require('socket.io');
const redis = require("redis");
const adapter = require('socket.io-redis');

const Logger = require('logplease');
const logger = Logger.create('server', { color: Logger.Colors.Magenta, filename: 'server.log', appendFile: true });

const host = 'localhost'
const port = process.env.REDIS_PORT ? process.env.REDIS_PORT : 6379;

class OrbitServer {
  static start() {
    let io = IO(3333);
    let pub = redis.createClient({ host: host, port: port, auth_pass: process.env.REDIS_PASSWORD });
    let sub = redis.createClient({ host: host, port: port, auth_pass: process.env.REDIS_PASSWORD });
    let client = redis.createClient({ host: host, port: port, auth_pass: process.env.REDIS_PASSWORD });

    io.adapter(adapter({ pubClient: pub, subClient: sub }));

    sub.on('message', (channel, data) => {
      io.sockets.in(channel).emit('message', channel, data);
    });

    io.on('connection', function (socket) {
      logger.info("Client connected from " + JSON.stringify(socket.request.connection._peername));

      socket.on('subscribe', function (event) {
        sub.subscribe(event.channel);
        socket.join(event.channel);
        logger.info("Client joined channel #" + event.channel);

        client.get(event.channel, (err, res) => {
          socket.emit('subscribed', event.channel, res);
        });

        socket.on('message', function (a) {
          const e = JSON.parse(a);
          if(e.channel === event.channel) {
            pub.publish(e.channel, e.message);
            client.set(e.channel, e.message);
          }
        });
      });

      socket.on('unsubscribe', function (event) {
        socket.leave(event.channel);
        logger.info("Client left channel #" + event.channel);
      });

      socket.on('disconnect', function () {
      });
    });

    logger.info("Started");
  }
};

module.exports = OrbitServer;
