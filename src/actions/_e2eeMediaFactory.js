"use strict";

/**
 * @internal
 * Shared factory for E2EE media send actions (image/video/audio/file).
 * Each concrete action file requires this and calls makeMediaAction(method, label).
 */
function makeMediaAction(method, label) {
  /**
   * @param {Object}   input
   * @param {string}   input.threadId   - Numeric user ID or @msgr JID (group E2EE media not yet supported).
   * @param {Buffer}   input.data       - Raw media bytes.
   * @param {string}   [input.mimeType] - MIME type (inferred from fileName when omitted).
   * @param {string}   [input.fileName] - File name hint for MIME inference.
   * @param {string}   [input.caption]  - Optional caption text.
   * @param {string}   [input.replyToMessageId] - Optional reply message ID.
   * @param {Function} [callback]       - callback(err, result)
   * @returns {Promise|undefined}
   */
  return function (defaultFuncs, api, ctx) {
    return function (input, callback) {
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
        return callback(new Error(label + ": E2EE not connected. Call api.connectE2EE() first."));
      }
      if (!input || !input.threadId || !input.data) {
        return callback(new Error(label + ": input.threadId and input.data (Buffer) are required."));
      }

      ctx.e2eeClient[method](input)
        .then(function (result) { callback(null, result); })
        .catch(function (err) { callback(err instanceof Error ? err : new Error(String(err))); });

      return returnPromise;
    };
  };
}

module.exports = makeMediaAction;
