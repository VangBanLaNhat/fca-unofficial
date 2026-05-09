"use strict";

var makeMediaAction = require("./_e2eeMediaFactory");

/**
 * Encrypts, uploads, and sends an E2EE file/document for a one-to-one E2EE chat.
 *
 * Requires api.connectE2EE() to have established a session first.
 * Group E2EE file send is not yet supported by FME.
 *
 * @param {Object}   input
 * @param {string}   input.threadId           - Numeric user ID or @msgr JID.
 * @param {Buffer}   input.data               - Raw file bytes.
 * @param {string}   [input.mimeType]         - MIME type (default: application/octet-stream).
 * @param {string}   [input.fileName]         - File name shown in Messenger.
 * @param {string}   [input.caption]          - Optional caption.
 * @param {string}   [input.replyToMessageId] - Optional reply message ID.
 * @param {Function} [callback]               - callback(err, result)
 * @returns {Promise|undefined}
 *
 * @example
 * const fs = require("fs");
 * api.sendFileE2ee({
 *   threadId: "1234567890",
 *   data: fs.readFileSync("./doc.pdf"),
 *   mimeType: "application/pdf",
 *   fileName: "doc.pdf"
 * }, (err, res) => { if (err) console.error(err); });
 */
module.exports = makeMediaAction("sendFile", "sendFileE2ee");
