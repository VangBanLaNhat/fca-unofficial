"use strict";

var makeMediaAction = require("./_e2eeMediaFactory");

/**
 * Encrypts, uploads, and sends an E2EE video for a one-to-one E2EE chat.
 *
 * Requires api.connectE2EE() to have established a session first.
 * Group E2EE video send is not yet supported by FME.
 *
 * @param {Object}   input
 * @param {string}   input.threadId           - Numeric user ID or @msgr JID.
 * @param {Buffer}   input.data               - Raw video bytes.
 * @param {string}   [input.mimeType]         - MIME type (default: video/mp4).
 * @param {string}   [input.fileName]         - File name hint.
 * @param {string}   [input.caption]          - Optional caption.
 * @param {string}   [input.replyToMessageId] - Optional reply message ID.
 * @param {Function} [callback]               - callback(err, result)
 * @returns {Promise|undefined}
 *
 * @example
 * const fs = require("fs");
 * api.sendVideoE2ee({
 *   threadId: "1234567890",
 *   data: fs.readFileSync("./clip.mp4"),
 *   mimeType: "video/mp4"
 * }, (err, res) => { if (err) console.error(err); });
 */
module.exports = makeMediaAction("sendVideo", "sendVideoE2ee");
