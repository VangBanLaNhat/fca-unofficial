"use strict";

var log = require("npmlog");
var e2eeBridge = require("../e2ee/bridge");
var e2eeThread = require("../e2ee/thread");

module.exports = function (_defaultFuncs, _api, ctx) {
  return function sendMessageE2EE(chatJid, message, callback) {
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
              log.error("sendMessageE2EE", cbErr);
            });
          }
        } catch (cbErr) {
          log.error("sendMessageE2EE", cbErr);
        }
      }

      if (err) return rejectFunc(err);
      resolveFunc(data);
    }

    var text = typeof message === "string" ? message : (message && (message.text || message.body));
    if (!chatJid || !text) {
      settle(new Error("sendMessageE2EE requires chatJid and message text"));
      return returnPromise;
    }

    if (!e2eeThread.isE2EEChatJid(chatJid)) {
        _api.sendMessage(
        text,
        chatJid,
        function (err, data) {
          settle(err, data);
        },
        message && message.replyToId
      );
      return returnPromise;
    }

    var options = {};
    if (message && typeof message === "object") {
      options.replyToId = message.replyToId;
      options.replyToSenderJid = message.replyToSenderJid;
    }

    e2eeBridge
      .createBridge(ctx)
      .sendMessage(chatJid, text, options)
      .then(function (res) {
        settle(null, {
          threadID: chatJid,
          messageID: res && res.messageId ? res.messageId : undefined,
          timestamp: Date.now(),
          isE2EE: true
        });
      })
      .catch(function (err) {
        settle(err);
      });

    return returnPromise;
  };
};
