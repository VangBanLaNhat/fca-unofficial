"use strict";

var log = require("npmlog");
var e2eeBridge = require("../e2ee/bridge");
var e2eeThread = require("../e2ee/thread");

module.exports = function (_defaultFuncs, _api, ctx) {
  return function sendTypingE2EE(chatJid, isTyping, callback) {
    var userCallback = typeof callback === "function" ? callback : null;

    if (typeof isTyping === "function") {
      userCallback = isTyping;
      isTyping = true;
    }

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
              log.error("sendTypingE2EE", cbErr);
            });
          }
        } catch (cbErr) {
          log.error("sendTypingE2EE", cbErr);
        }
      }

      if (err) return rejectFunc(err);
      resolveFunc(data);
    }

    if (!chatJid) {
      settle(new Error("sendTypingE2EE requires chatJid"));
      return returnPromise;
    }

    if (!e2eeThread.isE2EEChatJid(chatJid)) {
      _api.sendTypingIndicator(chatJid, function (err, endFn) {
        if (err) return settle(err);
        if (isTyping === false && typeof endFn === "function") {
          return endFn(function (endErr) {
            settle(endErr, true);
          });
        }
        settle(null, true);
      });
      return returnPromise;
    }

    e2eeBridge
      .createBridge(ctx)
      .sendTyping(chatJid, isTyping !== false)
      .then(function () {
        settle(null, true);
      })
      .catch(function (err) {
        settle(err);
      });

    return returnPromise;
  };
};
