"use strict";

var log = require("npmlog");
var Readable = require("stream").Readable;
var e2eeBridge = require("../e2ee/bridge");
var e2eeThread = require("../e2ee/thread");

function normalizeMediaInput(input) {
  if (Buffer.isBuffer(input)) {
    return input;
  }

  if (Array.isArray(input)) {
    return Buffer.from(input);
  }

  if (input && input.type === "Buffer" && Array.isArray(input.data)) {
    return Buffer.from(input.data);
  }

  if (typeof input === "string") {
    return Buffer.from(input, "base64");
  }

  return null;
}

module.exports = function (_defaultFuncs, _api, ctx) {
  return function sendMediaE2EE(chatJid, mediaType, data, options, callback) {
    var userCallback = typeof callback === "function" ? callback : null;

    if (typeof options === "function") {
      userCallback = options;
      options = {};
    }

    var resolveFunc = function () {};
    var rejectFunc = function () {};
    var returnPromise = new Promise(function (resolve, reject) {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    function settle(err, payload) {
      if (userCallback) {
        try {
          var cbResult = userCallback(err, payload);
          if (cbResult && typeof cbResult.then === "function") {
            cbResult.catch(function (cbErr) {
              log.error("sendMediaE2EE", cbErr);
            });
          }
        } catch (cbErr) {
          log.error("sendMediaE2EE", cbErr);
        }
      }

      if (err) return rejectFunc(err);
      resolveFunc(payload);
    }

    if (!chatJid || !mediaType || !data) {
      settle(new Error("sendMediaE2EE requires chatJid, mediaType, and data"));
      return returnPromise;
    }

    if (!e2eeThread.isE2EEChatJid(chatJid)) {
      var buffer = normalizeMediaInput(data);
      if (!buffer) {
        settle(new Error("sendMediaE2EE data must be Buffer, byte array, Buffer JSON, or base64 string"));
        return returnPromise;
      }

      _api.sendMessage(
        {
          body: options && options.caption ? String(options.caption) : "",
          attachment: Readable.from(buffer)
        },
        chatJid,
        function (err, payload) {
          settle(err, payload);
        },
        options && options.replyToId
      );
      return returnPromise;
    }

    e2eeBridge
      .createBridge(ctx)
      .sendMedia(chatJid, mediaType, data, options || {})
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
