"use strict";

/**
 * Sends an E2EE typing indicator (composing / paused) over the Noise socket.
 *
 * Requires api.connectE2EE() to have established a session first.
 *
 * @param {Object}   input
 * @param {string}   input.threadId  - Numeric user ID, @msgr JID, or group JID.
 * @param {boolean}  input.isTyping  - true = composing, false = paused.
 * @param {Function} [callback]      - callback(err)
 * @returns {Promise|undefined}
 *
 * @example
 * api.sendTypingE2ee({ threadId: "1234567890", isTyping: true }, (err) => {
 *   if (err) return console.error(err);
 * });
 * setTimeout(() => api.sendTypingE2ee({ threadId: "1234567890", isTyping: false }), 5000);
 */
module.exports = function (defaultFuncs, api, ctx) {
  return function sendTypingE2ee(input, callback) {
    var prResolve, prReject, returnPromise;
    if (typeof callback !== "function") {
      returnPromise = new Promise(function (resolve, reject) {
        prResolve = resolve;
        prReject = reject;
      });
      callback = function (err) {
        if (err) return prReject(err);
        return prResolve();
      };
    }

    if (!ctx.e2eeClient) {
      return callback(new Error("sendTypingE2ee: E2EE not connected. Call api.connectE2EE() first."));
    }
    if (!input || !input.threadId || typeof input.isTyping !== "boolean") {
      return callback(new Error("sendTypingE2ee: input.threadId and input.isTyping (boolean) are required."));
    }

    ctx.e2eeClient.sendTyping(input)
      .then(function () { callback(null); })
      .catch(function (err) { callback(err instanceof Error ? err : new Error(String(err))); });

    return returnPromise;
  };
};
