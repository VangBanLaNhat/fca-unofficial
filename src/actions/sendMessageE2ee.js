"use strict";

/**
 * Sends an E2EE text message.
 *
 * Requires api.connectE2EE() to have established a session first.
 *
 * @param {Object}   input
 * @param {string}   input.threadId          - Numeric user ID, @msgr JID, or group JID.
 * @param {string}   input.text              - Message body.
 * @param {string}   [input.replyToMessageId] - Optional replied message ID.
 * @param {Function} [callback]              - callback(err, result)
 * @returns {Promise|undefined}
 *
 * @example
 * api.sendMessageE2ee({ threadId: "1234567890", text: "Hello!" }, (err, res) => {
 *   if (err) return console.error(err);
 *   console.log(res.messageId);
 * });
 *
 * // With reply
 * api.sendMessageE2ee({ threadId: "1234567890", text: "Reply", replyToMessageId: "..." }, callback);
 *
 * // Promise style
 * const res = await api.sendMessageE2ee({ threadId: "1234567890", text: "Hello!" });
 */
module.exports = function (defaultFuncs, api, ctx) {
  return function sendMessageE2ee(input, callback) {
    var prResolve, prReject, returnPromise;
    if (typeof callback !== "function") {
      returnPromise = new Promise(function (resolve, reject) {
        prResolve = resolve;
        prReject = reject;
      });
      callback = function (err, result) {
        if (err) return prReject(err);
        return prResolve(result);
      };
    }

    if (!ctx.e2eeClient) {
      return callback(new Error("sendMessageE2ee: E2EE not connected. Call api.connectE2EE() first."));
    }
    if (!input || !input.threadId || !input.text) {
      return callback(new Error("sendMessageE2ee: input.threadId and input.text are required."));
    }

    ctx.e2eeClient.sendMessage(input)
      .then(function (result) { callback(null, result); })
      .catch(function (err) { callback(err instanceof Error ? err : new Error(String(err))); });

    return returnPromise;
  };
};
