"use strict";

var log = require("npmlog");

module.exports = function (defaultFuncs, api, ctx) {
  return function stopListenMqtt(callback) {
    callback = callback || function () {};

    if (!ctx.mqttClient) {
      return callback(new Error("Not connected to MQTT"));
    }

    ctx._stopListening = true;
    log.info("stopListenMqtt", "Stopping...");

    try {
      ctx.mqttClient.unsubscribe("/webrtc");
      ctx.mqttClient.unsubscribe("/rtc_multi");
      ctx.mqttClient.unsubscribe("/onevc");
      ctx.mqttClient.publish("/browser_close", "{}");
    } catch (_) {
      // noop
    }

    ctx.mqttClient.end(false, function () {
      log.info("stopListenMqtt", "Stopped");
      ctx.mqttClient = null;
      callback(null, true);
    });
  };
};
"use strict";

var log = require('npmlog');

module.exports = function (defaultFuncs, api, ctx){
  return function stopListenMqtt(callback) {
    callback = callback || function () {};

    if (!ctx.mqttClient) {
      return callback(new Error("Not connected to MQTT"));
    }

    ctx._stopListening = true;
    log.info("stopListenMqtt", "Stopping...");

    try {
      ctx.mqttClient.unsubscribe("/webrtc");
      ctx.mqttClient.unsubscribe("/rtc_multi");
      ctx.mqttClient.unsubscribe("/onevc");
      ctx.mqttClient.publish("/browser_close", "{}");
    } catch (_) {
      // noop
    }

    ctx.mqttClient.end(false, function () {
      log.info("stopListenMqtt", "Stopped");
      ctx.mqttClient = null;
      callback(null, true);
    });
  };
};