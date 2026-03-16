"use strict";

var base = require("../../../src/utils/base");

describe("base exports", function () {
  test("exposes core utility API surface", function () {
    var expectedFunctions = [
      "get",
      "post",
      "postFormData",
      "setProxy",
      "getJar",
      "makeDefaults",
      "parseAndCheckLogin",
      "saveCookies",
      "getAppState",
      "getFrom",
      "arrToForm",
      "decodeClientPayload",
      "generateThreadingID",
      "generateOfflineThreadingID",
      "getGUID",
      "getSignatureID",
      "generatePresence",
      "formatMessage",
      "formatDeltaMessage",
      "formatThread",
      "getType"
    ];

    expectedFunctions.forEach(function (name) {
      expect(base).toHaveProperty(name);
    });
  });
});
