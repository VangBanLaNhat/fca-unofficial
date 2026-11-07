"use strict";

var log = require("npmlog");

module.exports = function (_defaultFuncs, api, ctx) {
  return function getBotInitialData(callback) {
    var resolveFunc = function () {};
    var rejectFunc = function () {};
    var returnPromise = new Promise(function (resolve, reject) {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    if (!callback) {
      callback = function (err, data) {
        if (err) return rejectFunc(err);
        resolveFunc(data);
      };
    }

    api.httpGet(
      "https://www.facebook.com/profile.php?id=" + ctx.userID,
      null,
      { requestKind: "navigation" },
      function (err, html) {
        if (err) {
          log.error("getBotInitialData", err);
          return callback(err);
        }

        var profileMatch = html.match(/"CurrentUserInitialData",\[\],\{(.*?)\},(.*?)\]/);
        if (!profileMatch || !profileMatch[1]) {
          return callback(null, {
            error: "Something went wrong. Maybe the account is temporarily limited or Facebook changed the page data."
          });
        }

        try {
          var accountJson = JSON.parse("{" + profileMatch[1] + "}");
          accountJson.name = accountJson.NAME;
          accountJson.uid = accountJson.USER_ID;
          delete accountJson.NAME;
          delete accountJson.USER_ID;
          return callback(null, accountJson);
        } catch (parseErr) {
          log.error("getBotInitialData", parseErr);
          return callback(parseErr);
        }
      },
      true
    );

    return returnPromise;
  };
};
