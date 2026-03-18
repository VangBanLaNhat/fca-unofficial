"use strict";

var log = require("npmlog");
var e2eeBridge = require("../e2ee/bridge");

module.exports = function (_defaultFuncs, _api, ctx) {
  return function getE2EEDeviceData(callback) {
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
              log.error("getE2EEDeviceData", cbErr);
            });
          }
        } catch (cbErr) {
          log.error("getE2EEDeviceData", cbErr);
        }
      }

      if (err) return rejectFunc(err);
      resolveFunc(data);
    }

    var bridge = e2eeBridge.createBridge(ctx);
    if (ctx._e2eeDeviceData) {
      settle(null, ctx._e2eeDeviceData);
      return returnPromise;
    }

    bridge
      .getDeviceData()
      .then(function (deviceData) {
        ctx._e2eeDeviceData = deviceData;
        settle(null, deviceData);
      })
      .catch(function (err) {
        settle(err);
      });

    return returnPromise;
  };
};
