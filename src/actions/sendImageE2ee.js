"use strict";

var makeMediaAction = require("./_e2eeMediaFactory");

/**
 * Encrypts, uploads, and sends an E2EE image for a one-to-one E2EE chat.
 *
 * Requires api.connectE2EE() to have established a session first.
 * Group E2EE image send is not yet supported by FME.
 *
 * @param {Object}   input
 * @param {string}   input.threadId           - Numeric user ID or @msgr JID.
 * @param {Buffer}   input.data               - Raw image bytes.
 * @param {string}   [input.mimeType]         - MIME type (default: image/png).
 * @param {string}   [input.fileName]         - File name hint.
 * @param {string}   [input.caption]          - Optional caption.
 * @param {string}   [input.replyToMessageId] - Optional reply message ID.
 * @param {Function} [callback]               - callback(err, result)
 * @returns {Promise|undefined}
 *
 * @example
 * const fs = require("fs");
 * api.sendImageE2ee({
 *   threadId: "1234567890",
 *   data: fs.readFileSync("./photo.jpg"),
 *   mimeType: "image/jpeg",
 *   caption: "Look at this!"
 * }, (err, res) => { if (err) console.error(err); });
 */
module.exports = makeMediaAction("sendImage", "sendImageE2ee");
