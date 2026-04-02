"use strict";

var fs = require("fs");
var path = require("path");

try {
  require("dotenv").config({ path: path.resolve(process.cwd(), "test/config.env") });
} catch (_) {
  // Optional dotenv in local runs.
}

var login = require("../src/index.js");

var appStatePath = process.env.APPSTATE_PATH || path.join(process.cwd(), "test/appstate.json");
var userChatJid = String(process.env.E2EE_TEST_USER_ID || "").trim();
var groupChatJid = String(process.env.E2EE_TEST_GROUP_ID || "").trim();
var waitReadyMs = Number(process.env.E2EE_DEBUG_READY_TIMEOUT_MS || 20000);
var keepaliveMs = Number(process.env.E2EE_DEBUG_KEEPALIVE_MS || 30000);

if (!fs.existsSync(appStatePath)) {
  console.error("[e2ee-send-debug] appstate not found:", appStatePath);
  process.exit(1);
}

if (!userChatJid || !groupChatJid) {
  console.error("[e2ee-send-debug] missing E2EE_TEST_USER_ID or E2EE_TEST_GROUP_ID");
  process.exit(1);
}

var appState = JSON.parse(fs.readFileSync(appStatePath, "utf8"));
var api = null;
var listenHandle = null;
var fullyReadySeen = false;
var eventCounts = {};
var startedAt = Date.now();

function nowIso() {
  return new Date().toISOString();
}

function incType(type) {
  var t = String(type || "unknown");
  eventCounts[t] = (eventCounts[t] || 0) + 1;
}

function logEvent(prefix, evt) {
  var e2ee = evt && evt.e2ee ? evt.e2ee : null;
  console.log(
    "[e2ee-send-debug]",
    nowIso(),
    prefix,
    "type=" + (evt && evt.type ? evt.type : "unknown"),
    "chatJid=" + (e2ee && e2ee.chatJid ? e2ee.chatJid : ""),
    "senderJid=" + (e2ee && e2ee.senderJid ? e2ee.senderJid : "")
  );
}

function waitForFullyReady(ms) {
  return new Promise(function (resolve) {
    if (fullyReadySeen) return resolve(true);
    var started = Date.now();
    var timer = setInterval(function () {
      if (fullyReadySeen) {
        clearInterval(timer);
        return resolve(true);
      }
      if (Date.now() - started >= ms) {
        clearInterval(timer);
        return resolve(false);
      }
    }, 250);
  });
}

function printSummary(status) {
  console.log("\n[e2ee-send-debug] Summary:");
  console.log("- status:", status);
  console.log("- elapsedMs:", Date.now() - startedAt);
  console.log("- fullyReadySeen:", fullyReadySeen);
  console.log("- eventCounts:", JSON.stringify(eventCounts));
}

function cleanupThenExit(code, status) {
  var done = false;
  var guard = setTimeout(function () {
    if (done) return;
    done = true;
    printSummary(status + ":forced-exit");
    process.exit(code);
  }, 5000);

  function finish(finalStatus) {
    if (done) return;
    done = true;
    clearTimeout(guard);
    printSummary(finalStatus || status);
    process.exit(code);
  }

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
      finish(status);
    });
    return;
  }

  api.disconnectE2EE(function () {
    stopListen(function () {
      finish(status);
    });
  });
}

function sendOne(chatJid, label) {
  var text = "debug-" + label + "-" + Date.now();
  var sentAt = Date.now();
  console.log("[e2ee-send-debug] send start", label, chatJid, "text=" + text);

  return api
    .sendMessageE2EE(chatJid, { text: text })
    .then(function (info) {
      console.log(
        "[e2ee-send-debug] send ok",
        label,
        chatJid,
        "messageID=" + (info && info.messageID),
        "threadID=" + (info && info.threadID),
        "elapsedMs=" + (Date.now() - sentAt)
      );
      return info;
    })
    .catch(function (err) {
      console.error(
        "[e2ee-send-debug] send failed",
        label,
        chatJid,
        "elapsedMs=" + (Date.now() - sentAt),
        "error=" + String(err && (err.error || err.message || err))
      );
      throw err;
    });
}

process.on("SIGINT", function () {
  cleanupThenExit(130, "sigint");
});

console.log("[e2ee-send-debug] appstate:", appStatePath);
console.log("[e2ee-send-debug] targets:", userChatJid, groupChatJid);
console.log("[e2ee-send-debug] readyTimeoutMs:", waitReadyMs, "keepaliveMs:", keepaliveMs);

login(
  { appState: appState },
  { logLevel: "silent", enableE2EE: true, e2eeMemoryOnly: true },
  function (err, localApi) {
    if (err) {
      console.error("[e2ee-send-debug] login failed:", String(err && (err.error || err.message || err)));
      process.exit(1);
      return;
    }

    api = localApi;
    listenHandle = api.listen(function (listenErr, evt) {
      if (listenErr) {
        console.error("[e2ee-send-debug] listen error:", String(listenErr && (listenErr.error || listenErr.message || listenErr)));
        return;
      }

      if (!evt || !evt.isE2EE) return;
      incType(evt.type);
      if (evt.type === "e2ee_fully_ready") {
        fullyReadySeen = true;
      }
      logEvent("event", evt);
    });

    api.connectE2EE(function (connectErr) {
      if (connectErr) {
        console.error("[e2ee-send-debug] connectE2EE failed:", String(connectErr && (connectErr.error || connectErr.message || connectErr)));
        cleanupThenExit(1, "connect-error");
        return;
      }

      waitForFullyReady(waitReadyMs)
        .then(function (ready) {
          if (!ready) {
            throw new Error("e2ee_fully_ready not observed within " + waitReadyMs + "ms");
          }

          return sendOne(userChatJid, "user").then(function () {
            return sendOne(groupChatJid, "group");
          });
        })
        .then(function () {
          console.log("[e2ee-send-debug] sends completed, waiting keepalive for trailing events...");
          return new Promise(function (resolve) {
            setTimeout(resolve, keepaliveMs);
          });
        })
        .then(function () {
          cleanupThenExit(0, "ok");
        })
        .catch(function (e) {
          console.error("[e2ee-send-debug] flow failed:", String(e && (e.error || e.message || e)));
          cleanupThenExit(1, "flow-failed");
        });
    });
  }
);
