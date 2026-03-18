"use strict";

var log = require("npmlog");
var e2eeBridge = require("../e2ee/bridge");

module.exports = function (_defaultFuncs, _api, ctx) {
  return function disconnectE2EE(callback) {
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
              log.error("disconnectE2EE", cbErr);
            });
          }
        } catch (cbErr) {
          log.error("disconnectE2EE", cbErr);
        }
      }

      if (err) return rejectFunc(err);
      resolveFunc(data);
    }

    e2eeBridge
      .createBridge(ctx)
      .disconnect()
      .then(function () {
        settle(null, { connected: false });
      })
      .catch(function (err) {
        settle(err);
      });

    return returnPromise;
  };
};
