"use strict";

var base = require("./base");

module.exports = {
  generateThreadingID: base.generateThreadingID,
  generateOfflineThreadingID: base.generateOfflineThreadingID,
  getGUID: base.getGUID,
  getSignatureID: base.getSignatureID,
  generateTimestampRelative: base.generateTimestampRelative,
  generatePresence: base.generatePresence
};
