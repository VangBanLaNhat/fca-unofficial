/* eslint-disable no-unused-vars */
"use strict";

var log = require("npmlog");
var utils = require("../utils");
var EventEmitter = require("events");

/**
 * Starts an E2EE session on top of the existing fca-unofficial auth.
 *
 * Returns an EventEmitter (E2EEEmitter) that bridges all FME events.
 * The optional callback is invoked for every event - same pattern as listenMqtt.
 * If no callback is given, listen via emitter.on("message", ...) / emitter.on("error", ...).
 *
 * After the E2EE stream is ready, dedicated send actions become available:
 * api.sendMessageE2ee, api.sendReactionE2ee, api.unsendMessageE2ee,
 * api.sendTypingE2ee, api.sendImageE2ee, api.sendVideoE2ee,
 * api.sendAudioE2ee, api.sendFileE2ee, api.disconnectE2ee.
 *
 * @see https://github.com/HerokeyVN/FB-Messenger-E2EE/blob/main/DOCS.md
 *
 * @param {Object}   options
 * @param {string}   options.deviceStorePath    - Path to device-store.json (required, keep persistent).
 * @param {string}   [options.sessionStorePath] - Optional path to session.json.
 * @param {Function} [callback]                 - callback(err, event) - called for every incoming event.
 * @returns {E2EEEmitter}
 *
 * @example
 * // EventEmitter style (recommended)
 * var emitter = api.connectE2EE({ deviceStorePath: "./device-store.json" });
 * emitter.on("message", function(event) {
 *   if (event.type === "e2ee_connected") console.log("E2EE ready");
 *   if (event.type === "e2ee_message")  console.log(event.data.threadId, event.data.text);
 * });
 * emitter.on("error", function(err) { console.error(err); });
 *
 * // Callback style (same as listenMqtt)
 * api.connectE2EE({ deviceStorePath: "./device-store.json" }, function(err, event) {
 *   if (err) return console.error(err);
 *   if (event.type === "e2ee_message") console.log(event.data.text);
 * });
 */
module.exports = function (defaultFuncs, api, ctx) {
  return function connectE2EE(options, callback) {
    if (!options || !options.deviceStorePath) {
      throw new Error("connectE2EE: options.deviceStorePath is required");
    }

    // EventEmitter subclass (mirrors MessageEmitter in listenMqtt)
    class E2EEEmitter extends EventEmitter {
      constructor() {
        super();
      }

      disconnect() {
        if (ctx.e2eeClient) {
          ctx.e2eeClient.disconnect().catch(function (err) {
            log.error("connectE2EE", "disconnect error:", err);
          });
          ctx.e2eeClient = null;
        }
      }
    }

    var msgEmitter = new E2EEEmitter();

    // Route all events through a single internal handler
    var globalCallback = typeof callback === "function"
      ? callback
      : function (err, event) {
        if (err) return msgEmitter.emit("error", err);
        msgEmitter.emit("message", event);
      };

    var { FBClient } = require("fb-messenger-e2ee");

    var appState = utils.getAppState(ctx.jar);
    var clientOptions = { appState: appState, platform: "facebook" };
    if (options.sessionStorePath) clientOptions.sessionStorePath = options.sessionStorePath;

    var e2eeClient;
    try {
      e2eeClient = new FBClient(clientOptions);
    } catch (e) {
      globalCallback(new Error("[connectE2EE] Failed to instantiate FBClient: " + e.message), null);
      return msgEmitter;
    }

    e2eeClient.onEvent(function (event) {
      globalCallback(null, event);
    });

    // Connect
    e2eeClient.connect()
      .then(function (connectResult) {
        var userId = (connectResult && connectResult.userId) || ctx.userID;
        return e2eeClient.connectE2EE(options.deviceStorePath, userId);
      })
      .then(function () {
        // Store on ctx so all E2EE action files can access the client
        ctx.e2eeClient = e2eeClient;
      })
      .catch(function (e) {
        log.error("connectE2EE", e);
        globalCallback(e instanceof Error ? e : new Error(String(e)), null);
      });

    return msgEmitter;
  };
};
