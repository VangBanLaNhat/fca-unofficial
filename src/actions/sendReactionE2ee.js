"use strict";

/**
 * Sends an E2EE reaction to a message.
 *
 * Requires api.connectE2EE() to have established a session first.
 * For group messages sent by someone else, pass senderJid so the
 * target MessageKey is encoded correctly.
 *
 * @param {Object}   input
 * @param {string}   input.threadId   - Numeric user ID, @msgr JID, or group JID.
 * @param {string}   input.messageId  - ID of the message to react to.
 * @param {string}   input.senderJid  - Device JID of the message sender (e.g. "100042415119261.145@msgr").
 * @param {string}   input.reaction   - Emoji reaction string (e.g. "👍"). Empty string to remove.
 * @param {Function} [callback]       - callback(err)
 * @returns {Promise|undefined}
 *
 * @example
 * api.sendReactionE2ee({
 *   threadId: "1805602490133470@g.us",
 *   messageId: "7456658723671758234",
 *   senderJid: "100042415119261.145@msgr",
 *   reaction: "👍"
 * }, (err) => { if (err) console.error(err); });
 */
module.exports = function (defaultFuncs, api, ctx) {
  return function sendReactionE2ee(input, callback) {
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
      return callback(new Error("sendReactionE2ee: E2EE not connected. Call api.connectE2EE() first."));
    }
    if (!input || !input.threadId || !input.messageId || !input.senderJid) {
      return callback(new Error("sendReactionE2ee: input.threadId, input.messageId, and input.senderJid are required."));
    }

    ctx.e2eeClient.sendReaction(input)
      .then(function () { callback(null); })
      .catch(function (err) { callback(err instanceof Error ? err : new Error(String(err))); });

    return returnPromise;
  };
};
