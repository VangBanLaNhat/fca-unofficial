"use strict";

var log = require("npmlog");
var e2eeBridge = require("../e2ee/bridge");

module.exports = function (_defaultFuncs, _api, ctx) {
  return function downloadE2EEMedia(options, callback) {
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
              log.error("downloadE2EEMedia", cbErr);
            });
          }
        } catch (cbErr) {
          log.error("downloadE2EEMedia", cbErr);
        }
      }

      if (err) return rejectFunc(err);
      resolveFunc(data);
    }

    if (!options || !options.directPath || !options.mediaKey || !options.mediaSha256 || !options.mediaType || !options.mimeType || options.fileSize == null) {
      settle(new Error("downloadE2EEMedia requires directPath, mediaKey, mediaSha256, mediaType, mimeType, and fileSize"));
      return returnPromise;
    }

    e2eeBridge
      .createBridge(ctx)
      .downloadMedia(options)
      .then(function (result) {
        settle(null, result);
      })
      .catch(function (err) {
        settle(err);
      });

    return returnPromise;
  };
};
