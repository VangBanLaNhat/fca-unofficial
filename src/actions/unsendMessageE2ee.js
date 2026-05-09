"use strict";

/**
 * Un-sends (revokes) an E2EE message you previously sent.
 *
 * Requires api.connectE2EE() to have established a session first.
 * The original message must still be in the outbound cache (recent sends)
 * or you must pass threadId explicitly.
 *
 * @param {string}   messageId  - ID of the message to unsend.
 * @param {Function} [callback] - callback(err)
 * @returns {Promise|undefined}
 *
 * @example
 * api.unsendMessageE2ee("7456191609143713633", (err) => {
 *   if (err) return console.error(err);
 * });
 */
module.exports = function (defaultFuncs, api, ctx) {
  return function unsendMessageE2ee(messageId, callback) {
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
      return callback(new Error("unsendMessageE2ee: E2EE not connected. Call api.connectE2EE() first."));
    }
    if (!messageId) {
      return callback(new Error("unsendMessageE2ee: messageId is required."));
    }

    ctx.e2eeClient.unsendMessage(messageId)
      .then(function () { callback(null); })
      .catch(function (err) { callback(err instanceof Error ? err : new Error(String(err))); });

    return returnPromise;
  };
};
