"use strict";

var fs = require("fs");
var path = require("path");

try {
  require("dotenv").config({ path: path.resolve(process.cwd(), "test/config.env") });
} catch (_) {
  // Optional dotenv for local usage.
}

var login = require("../src/index.js");

var appStatePath = process.env.APPSTATE_PATH || path.join(process.cwd(), "test/appstate.json");
var userChatJid = String(process.env.E2EE_TEST_USER_ID || "").trim();
var groupChatJid = String(process.env.E2EE_TEST_GROUP_ID || "").trim();

function exitWith(message, code) {
  console.error("[e2ee-send-smoke] " + message);
  process.exit(code || 1);
}

if (!fs.existsSync(appStatePath)) {
  exitWith("appstate not found at " + appStatePath);
}

if (!userChatJid || !groupChatJid) {
  exitWith("missing E2EE_TEST_USER_ID or E2EE_TEST_GROUP_ID in environment/test/config.env");
}

var appState = JSON.parse(fs.readFileSync(appStatePath, "utf8"));

var api = null;
var listenHandle = null;
var fullyReadySeen = false;

function sendOne(chatJid, label) {
  var text = "smoke-" + label + "-" + Date.now();
  var started = Date.now();
  console.log("[e2ee-send-smoke] send start", label, chatJid);

  return api.sendMessageE2EE(chatJid, { text: text }).then(function (info) {
    console.log(
      "[e2ee-send-smoke] send ok",
      label,
      chatJid,
      "messageID=" + (info && info.messageID),
      "elapsedMs=" + (Date.now() - started)
    );
    return info;
  });
}

function waitForFullyReady(timeoutMs) {
  return new Promise(function (resolve) {
    if (fullyReadySeen) return resolve(true);
    var started = Date.now();
    var timer = setInterval(function () {
      if (fullyReadySeen) {
        clearInterval(timer);
        return resolve(true);
      }
      if (Date.now() - started >= timeoutMs) {
        clearInterval(timer);
        return resolve(false);
      }
    }, 250);
  });
}

function cleanupThenExit(code) {
  var done = false;
  function finish() {
    if (done) return;
    done = true;
    process.exit(code);
  }

  var guard = setTimeout(finish, 5000);

  function stopListen(next) {
    if (listenHandle && typeof listenHandle.stopListening === "function") {
      return listenHandle.stopListening(function () {
        next();
      });
    }
    next();
  }

  if (!api || typeof api.disconnectE2EE !== "function") {
    stopListen(function () {
      clearTimeout(guard);
      finish();
    });
    return;
  }

  api.disconnectE2EE(function () {
    stopListen(function () {
      clearTimeout(guard);
      finish();
    });
  });
}

login(
  { appState: appState },
  { logLevel: "silent", enableE2EE: true, e2eeMemoryOnly: true },
  function (err, localApi) {
    if (err) {
      return exitWith("login failed: " + String(err && (err.error || err.message || err)));
    }

    api = localApi;
    if (!api || typeof api.sendMessageE2EE !== "function") {
      return exitWith("sendMessageE2EE controller is unavailable");
    }

    listenHandle = api.listen(function (_listenErr, evt) {
      if (evt && evt.type === "e2ee_fully_ready") fullyReadySeen = true;
    });

    api.connectE2EE(function (connectErr) {
      if (connectErr) {
        return exitWith("connectE2EE failed: " + String(connectErr && (connectErr.error || connectErr.message || connectErr)));
      }

      waitForFullyReady(15000)
        .then(function (ready) {
          if (!ready) {
            throw new Error("e2ee_fully_ready not observed within 15000ms");
          }

          return sendOne(userChatJid, "user").then(function () {
            return sendOne(groupChatJid, "group");
          });
        })
        .then(function () {
          console.log("[e2ee-send-smoke] success");
          cleanupThenExit(0);
        })
        .catch(function (sendErr) {
          console.error("[e2ee-send-smoke] failed:", String(sendErr && (sendErr.error || sendErr.message || sendErr)));
          cleanupThenExit(1);
        });
    });
  }
);
