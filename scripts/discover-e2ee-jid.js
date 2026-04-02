"use strict";

var fs = require("fs");
var path = require("path");

try {
  require("dotenv").config({ path: path.resolve(process.cwd(), "test/config.env") });
} catch (_) {
  // Optional in environments that inject vars directly.
}

var login = require("../src/index.js");

function uniquePush(list, value) {
  if (!value) return false;
  if (list.indexOf(value) >= 0) return false;
  list.push(value);
  return true;
}

function nowIso() {
  return new Date().toISOString();
}

var appStatePath = process.env.APPSTATE_PATH || path.resolve(process.cwd(), "test/appstate.json");
if (!fs.existsSync(appStatePath)) {
  console.error("[discover-e2ee-jid] Missing appstate file:", appStatePath);
  process.exit(1);
}

var maxMs = Number(process.env.E2EE_DISCOVER_TIMEOUT_MS || 180000);
var silent = String(process.env.E2EE_DISCOVER_SILENT || "0") === "1";

var appState = JSON.parse(fs.readFileSync(appStatePath, "utf8"));
var foundChatJids = [];
var foundSenderJids = [];
var emitter = null;
var api = null;
var timer = null;
var currentUserId = "";
var echoQueue = Promise.resolve();

function delay(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

function getBaseId(value) {
  var raw = String(value || "");
  var colonIndex = raw.indexOf(":");
  if (colonIndex > 0) {
    return raw.slice(0, colonIndex);
  }

  var atIndex = raw.indexOf("@");
  if (atIndex > 0) {
    return raw.slice(0, atIndex);
  }

  return raw;
}

function enqueueEcho(chatJid, senderJid, body) {
  var senderBaseId = getBaseId(senderJid);
  if (currentUserId && senderBaseId && senderBaseId === currentUserId) {
    return;
  }

  var text = String(body || "").trim();
  if (!chatJid || !text) {
    return;
  }

  var replyText = "[Bot] " + text;
  var sendDelayMs = replyText.length * 200;

  echoQueue = echoQueue
    .then(function () {
      console.log("[discover-e2ee-jid] echo queue", "chatJid=" + chatJid, "delayMs=" + sendDelayMs, "chars=" + replyText.length);

      var typingOn = Promise.resolve();
      if (typeof api.sendTypingE2EE === "function") {
        typingOn = api.sendTypingE2EE(chatJid, true);
      }

      return typingOn
        .catch(function (err) {
          console.error("[discover-e2ee-jid] typing on failed:", err && (err.error || err.message || err));
        })
        .then(function () {
          return delay(sendDelayMs);
        })
        .then(function () {
          return api.sendMessageE2EE(chatJid, { text: replyText });
        })
        .then(function (info) {
          console.log("[discover-e2ee-jid] echo sent", "chatJid=" + chatJid, "messageID=" + ((info && info.messageID) || ""));
        })
        .catch(function (err) {
          console.error("[discover-e2ee-jid] echo failed:", err && (err.error || err.message || err));
        })
        .then(function () {
          if (typeof api.sendTypingE2EE !== "function") {
            return;
          }
          return api.sendTypingE2EE(chatJid, false).catch(function (err) {
            console.error("[discover-e2ee-jid] typing off failed:", err && (err.error || err.message || err));
          });
        });
    })
    .catch(function (err) {
      console.error("[discover-e2ee-jid] echo queue error:", err && (err.error || err.message || err));
    });
}

function printSummary(reason) {
  console.log("\n[discover-e2ee-jid] Summary (" + reason + ")");
  if (!foundChatJids.length) {
    console.log("- No chatJid discovered yet.");
  } else {
    console.log("- chatJid:");
    foundChatJids.forEach(function (v) {
      console.log("  " + v);
    });
  }

  if (!foundSenderJids.length) {
    console.log("- No senderJid discovered yet.");
  } else {
    console.log("- senderJid:");
    foundSenderJids.forEach(function (v) {
      console.log("  " + v);
    });
  }

  if (foundChatJids.length) {
    console.log("\n[discover-e2ee-jid] Example env values:");
    console.log("E2EE_TEST_USER_ID=" + foundChatJids[0]);
    if (foundChatJids.length > 1) {
      console.log("E2EE_TEST_GROUP_ID=" + foundChatJids[1]);
    }
  }
}

function cleanupAndExit(code, reason) {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }

  printSummary(reason || "exit");

  var done = function () {
    process.exit(code);
  };

  try {
    if (api && typeof api.disconnectE2EE === "function") {
      api.disconnectE2EE(function () {
        if (emitter && typeof emitter.stopListening === "function") {
          emitter.stopListening(function () {
            done();
          });
          return;
        }
        done();
      });
      return;
    }
  } catch (_) {
    // ignore and try next cleanup path
  }

  try {
    if (emitter && typeof emitter.stopListening === "function") {
      emitter.stopListening(function () {
        done();
      });
      return;
    }
  } catch (_) {
    // ignore
  }

  done();
}

console.log("[discover-e2ee-jid] Logging in with appstate:", appStatePath);
console.log("[discover-e2ee-jid] Timeout:", maxMs + "ms");
console.log("[discover-e2ee-jid] Send a message from your Messenger app to this account in an E2EE chat now...");

login(
  { appState: appState },
  {
    logLevel: "silent",
    enableE2EE: true,
    e2eeMemoryOnly: true
  },
  function (err, localApi) {
    if (err) {
      console.error("[discover-e2ee-jid] Login failed:", err && (err.error || err.message || err));
      process.exit(1);
      return;
    }

    api = localApi;
    if (api && typeof api.getCurrentUserID === "function") {
      currentUserId = String(api.getCurrentUserID() || "");
    }

    emitter = api.listen(function (listenErr, event) {
      if (listenErr) {
        if (!silent) {
          console.error("[discover-e2ee-jid] listen error:", listenErr && (listenErr.error || listenErr.message || listenErr));
        }
        return;
      }

      if (!event || !event.isE2EE) {
        return;
      }

      var chatJid = event.e2ee && event.e2ee.chatJid;
      var senderJid = event.e2ee && event.e2ee.senderJid;
      var body = typeof event.body === "string" ? event.body : "";
      var added = false;

      added = uniquePush(foundChatJids, chatJid) || added;
      added = uniquePush(foundSenderJids, senderJid) || added;

      if (added || !silent) {
        console.log(
          "[discover-e2ee-jid]",
          nowIso(),
          "type=" + (event.type || "unknown"),
          "chatJid=" + (chatJid || ""),
          "senderJid=" + (senderJid || ""),
          "body=" + (body || "")
        );
      }

      if (event.type === "e2ee_message") {
        enqueueEcho(chatJid, senderJid, body);
      }
    });

    api.connectE2EE(function (connectErr) {
      if (connectErr) {
        console.error("[discover-e2ee-jid] connectE2EE failed:", connectErr && (connectErr.error || connectErr.message || connectErr));
        cleanupAndExit(1, "connect-error");
        return;
      }

      console.log("[discover-e2ee-jid] E2EE connected. Waiting for events...");
    });
  }
);

timer = setTimeout(function () {
  cleanupAndExit(0, "timeout");
}, maxMs);

process.on("SIGINT", function () {
  cleanupAndExit(0, "sigint");
});
