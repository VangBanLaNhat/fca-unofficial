"use strict";

var log = require("npmlog");

/**
 * Disconnects the active E2EE stream (Noise socket, heartbeat, prekey maintenance).
 *
 * Safe to call even if E2EE is not connected.
 *
 * @param {Function} [callback] - callback(err)
 * @returns {Promise|undefined}
 *
 * @example
 * api.disconnectE2ee((err) => {
 *   if (err) return console.error(err);
 *   console.log("E2EE disconnected");
 * });
 *
 * // Promise style
 * await api.disconnectE2ee();
 */
module.exports = function (defaultFuncs, api, ctx) {
  return function disconnectE2ee(callback) {
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
      return callback(null); // already disconnected
    }

    ctx.e2eeClient.disconnect()
      .then(function () {
        ctx.e2eeClient = null;
        callback(null);
      })
      .catch(function (err) {
        log.error("disconnectE2ee", err);
        ctx.e2eeClient = null;
        callback(err instanceof Error ? err : new Error(String(err)));
      });

    return returnPromise;
  };
};
