"use strict";

var log = require("npmlog");
var e2eeBridge = require("../e2ee/bridge");
var e2eeThread = require("../e2ee/thread");

module.exports = function (_defaultFuncs, _api, ctx) {
  return function unsendMessageE2EE(chatJid, messageID, callback) {
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
              log.error("unsendMessageE2EE", cbErr);
            });
          }
        } catch (cbErr) {
          log.error("unsendMessageE2EE", cbErr);
        }
      }

      if (err) return rejectFunc(err);
      resolveFunc(data);
    }

    if (!chatJid || !messageID) {
      settle(new Error("unsendMessageE2EE requires chatJid and messageID"));
      return returnPromise;
    }

    if (!e2eeThread.isE2EEChatJid(chatJid)) {
      _api.unsendMessage(messageID, function (err, data) {
        settle(err, data);
      });
      return returnPromise;
    }

    e2eeBridge
      .createBridge(ctx)
      .unsendMessage(chatJid, messageID)
      .then(function () {
        settle(null, true);
      })
      .catch(function (err) {
        settle(err);
      });

    return returnPromise;
  };
};
