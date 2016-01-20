var os      = require("os");
var librato = require('librato-node');

var hostname = os.hostname();
var prefix   = "orbit-server.";
var interval = 60000;
var timer    = null;

librato.configure({
  email: process.env.LIBRATO_EMAIL,
  token: process.env.LIBRATO_TOKEN
});

var started = false;

var Metrics = {
  accumulators: {
    connect: 0,
    newuser: 0,
    read: 0,
    write: 0,
    setMode: 0,
  },
  interval: interval,
  prefix: prefix,
  timer: timer,
  isRunning: function() {
    return started;
  },
  start: function(log) {
    this.log = log;
    var self = this;
    if(!self.timer) {
      // librato.start();
      started = true;
      process.once('SIGINT', function() {
        self.stop();
      });
      self.timer = setInterval(function() {
        self.flush();
      }, self.interval);
    }
  },
  flush: function(callback) {
    var metrics = this.accumulators;
    var self = this;
    Object.keys(metrics).forEach(function(k) {
      if(typeof(metrics[k]) !== "function") {
        if(self.log) console.log(prefix + k + ": " + metrics[k])
        librato.measure(prefix + k, metrics[k], { source: hostname });
        metrics[k] = 0;
      }
    });

    try {
      if(started) librato.flush();
      if(callback) callback(null);
    } catch(e) {
      console.log(e);
    }
  },
  stop: function(callback) {
    if(this.timer) {
      clearInterval(this.timer);
      process.removeAllListeners('SIGINT');
      this.timer = null;
    }

    this.flush(function(err) {
      librato.stop();
      started = false;
      if(callback) callback(err);
    });
  }
}

module.exports = Metrics;
