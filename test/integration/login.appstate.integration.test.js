"use strict";

var fs = require("fs");
var path = require("path");
var login = require("../../src/index.js");

var appStatePath = process.env.APPSTATE_PATH || path.join(__dirname, "../appstate.json");
var hasAppState = fs.existsSync(appStatePath);

var describeWithAppState = hasAppState ? describe : describe.skip;

describeWithAppState("Login with appstate.json", function () {
  jest.setTimeout(30000);

  test("should login and logout successfully with appstate", function () {
    var raw = fs.readFileSync(appStatePath, "utf8");
    var appState = JSON.parse(raw);

    return new Promise(function (resolve, reject) {
      login({ appState: appState }, { logLevel: "silent" }, function (err, api) {
        if (err) {
          return reject(err);
        }

        if (!api || typeof api.getCurrentUserID !== "function") {
          return reject(new Error("Login succeeded but API object is invalid."));
        }

        var userID = api.getCurrentUserID();
        if (!userID) {
          return reject(new Error("Could not resolve current user ID after login."));
        }

        if (typeof api.logout !== "function") {
          return reject(new Error("API object does not expose logout function."));
        }

        api.logout(function (logoutErr) {
          if (logoutErr) {
            return reject(logoutErr);
          }
          resolve();
        });
      });
    });
  });
});
