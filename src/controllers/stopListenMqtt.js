"use strict";

var log = require("npmlog");

module.exports = function (_defaultFuncs, _api, ctx) {
  return function stopListenMqtt(callback) {
    var userCallback = typeof callback === "function" ? callback : null;

    var resolveFunc = function () {};
    var rejectFunc = function () {};
    var returnPromise = new Promise(function (resolve, reject) {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    function settle(err, data) {
      if (userCallback) {
        try {
          var cbResult = userCallback(err, data);
          if (cbResult && typeof cbResult.then === "function") {
            cbResult.catch(function (cbErr) {
              log.error("stopListenMqtt", cbErr);
            });
          }
        } catch (cbErr) {
          log.error("stopListenMqtt", cbErr);
        }
      }

      if (err) {
        rejectFunc(err);
      } else {
        resolveFunc(data);
      }
    }

    if (!ctx.mqttClient) {
      settle(new Error("Not connected to MQTT"));
      return returnPromise;
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
      settle(null, true);
    });

    return returnPromise;
  };
};
