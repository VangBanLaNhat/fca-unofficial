"use strict";

var fs = require("fs");
var path = require("path");

try {
  require("dotenv").config({ path: path.resolve(process.cwd(), "test/config.env") });
} catch (_) {
  // Optional when env is injected externally.
}

var login = require("../src/index.js");

var appStatePath = process.env.APPSTATE_PATH || path.resolve(process.cwd(), "test/appstate.json");
if (!fs.existsSync(appStatePath)) {
  console.error("[listen-echo-all] Missing appstate file:", appStatePath);
  process.exit(1);
}

var maxMs = Number(process.env.ECHO_LISTEN_TIMEOUT_MS || 0); // 0 = no timeout
var silent = String(process.env.ECHO_LISTEN_SILENT || "0") === "1";
var enableTyping = String(process.env.ECHO_ENABLE_TYPING || "1") === "1";
var sendTimeoutMs = Number(process.env.ECHO_SEND_TIMEOUT_MS || 15000);
var e2eeSendTimeoutMs = Number(process.env.ECHO_E2EE_SEND_TIMEOUT_MS || 20000);

var appState = JSON.parse(fs.readFileSync(appStatePath, "utf8"));
var api = null;
var emitter = null;
var timer = null;
var currentUserId = "";
var echoQueues = Object.create(null);
var regularTypingEnabled = enableTyping;

function nowIso() {
  return new Date().toISOString();
}

function delay(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise(function (_resolve, reject) {
      setTimeout(function () {
        reject(new Error(label + " timeout"));
      }, ms);
    })
  ]);
}

function is404TypingError(err) {
  var msg = String((err && (err.error || err.message)) || err || "").toLowerCase();
  return msg.indexOf("status code: 404") !== -1;
}

function isTypingTimeoutError(err) {
  var msg = String((err && (err.error || err.message)) || err || "").toLowerCase();
  return msg.indexOf("typing on timeout") !== -1;
}

function getBaseId(value) {
  var raw = String(value || "");
  var colonIndex = raw.indexOf(":");
  if (colonIndex > 0) return raw.slice(0, colonIndex);
  var atIndex = raw.indexOf("@");
  if (atIndex > 0) return raw.slice(0, atIndex);
  return raw;
}

function cleanupAndExit(code, reason) {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }

  console.log("[listen-echo-all] exit reason=", reason || "exit");

  function done() {
    process.exit(code);
  }

  try {
    if (api && typeof api.disconnectE2EE === "function") {
      return api.disconnectE2EE(function () {
        if (emitter && typeof emitter.stopListening === "function") {
          return emitter.stopListening(function () {
            done();
          });
        }
        done();
      });
    }
  } catch (_) {
    // continue
  }

  try {
    if (emitter && typeof emitter.stopListening === "function") {
      return emitter.stopListening(function () {
        done();
      });
    }
  } catch (_) {
    // continue
  }

  done();
}

function queueEcho(queueKey, task) {
  if (!echoQueues[queueKey]) {
    echoQueues[queueKey] = Promise.resolve();
  }

  echoQueues[queueKey] = echoQueues[queueKey]
    .then(task)
    .catch(function (err) {
      console.error("[listen-echo-all] queue error:", err && (err.error || err.message || err));
    });

  return echoQueues[queueKey];
}

function echoRegular(event) {
  var threadID = event && event.threadID;
  var senderID = String(event && event.senderID || "");
  var body = String(event && event.body || "").trim();
  var isGroup = !!(event && event.isGroup);

  if (!threadID || !body) return;
  if (currentUserId && senderID === currentUserId) return; // prevent self-loop
  if (body.indexOf("[Bot] ") === 0) return; // prevent bot-to-bot loop

  queueEcho("regular: " + threadID + (new Date()).getTime(), async function () {
    var replyText = "[Bot] " + body;
    var sendDelayMs = (replyText.length - 0) * 200;
    var endTypingFn = null;

    if (!silent) {
      console.log("[listen-echo-all] regular echo queue", "threadID=" + threadID, "isGroup=" + isGroup, "delayMs=" + sendDelayMs, "chars=" + (replyText.length - 6));
    }

    try {
      api.sendTypingIndicator(true, threadID, undefined, isGroup).catch(function () {});
      await delay(sendDelayMs);
      api.sendTypingIndicator(false, threadID, undefined, isGroup).catch(function () {});
      await withTimeout(
        api.sendMessage(replyText, threadID),
        sendTimeoutMs,
        "regular send"
      );

      if (!silent) {
        console.log("[listen-echo-all] regular echo sent", "threadID=" + threadID);
      }
    } catch (err) {
      console.error("[listen-echo-all] regular echo failed:", err && (err.error || err.message || err));
    } finally {
      if (enableTyping && typeof endTypingFn === "function") {
        endTypingFn().catch(function () {
          // ignore typing off errors
        });
      }
    }
  });
}

function echoE2EE(event) {
  var chatJid = event && event.e2ee && event.e2ee.chatJid;
  var senderJid = event && event.e2ee && event.e2ee.senderJid;
  var senderBase = getBaseId(senderJid);
  var body = String(event && event.body || "").trim();

  if (!chatJid || !body) return;
  if (currentUserId && senderBase && senderBase === currentUserId) return; // prevent self-loop
  if (body.indexOf("[Bot] ") === 0) return; // prevent bot-to-bot loop

  queueEcho("e2ee:" + chatJid + ((new Date()).getTime()), async function () {
    var replyText = "[Bot] " + body;
    var sendDelayMs = (replyText.length - 6) * 200;

    if (!silent) {
      console.log("[listen-echo-all] e2ee echo queue", "chatJid=" + chatJid, "delayMs=" + sendDelayMs, "chars=" + (replyText.length - 6));
    }

    try {
      if (enableTyping) {
        try {
          await api.sendTypingE2EE(chatJid, true);
        } catch (err) {
          console.error("[listen-echo-all] typing on failed:", err && (err.error || err.message || err));
        }
      }

      await delay(sendDelayMs);
      var info = await withTimeout(
        api.sendMessageE2EE(chatJid, { text: replyText }),
        e2eeSendTimeoutMs,
        "e2ee send"
      );

      if (!silent) {
        console.log("[listen-echo-all] e2ee echo sent", "chatJid=" + chatJid, "messageID=" + ((info && info.messageID) || ""));
      }
    } catch (err) {
      console.error("[listen-echo-all] e2ee echo failed:", err && (err.error || err.message || err));
    } finally {
      if (enableTyping) {
        api.sendTypingE2EE(chatJid, false).catch(function (err) {
          console.error("[listen-echo-all] typing off failed:", err && (err.error || err.message || err));
        });
      }
    }
  });
}

console.log("[listen-echo-all] Logging in with appstate:", appStatePath);
if (maxMs > 0) {
  console.log("[listen-echo-all] Timeout:", maxMs + "ms");
}
console.log("[listen-echo-all] Typing enabled:", enableTyping ? "yes" : "no");
console.log("[listen-echo-all] Send timeout ms:", sendTimeoutMs, "e2ee:", e2eeSendTimeoutMs);

login(
  { appState: appState },
  {
    logLevel: "silent",
    enableE2EE: true,
    e2eeMemoryOnly: true
  },
  function (err, localApi) {
    if (err) {
      console.error("[listen-echo-all] Login failed:", err && (err.error || err.message || err));
      process.exit(1);
      return;
    }

    api = localApi;
    if (api && typeof api.getCurrentUserID === "function") {
      currentUserId = String(api.getCurrentUserID() || "");
    }

    emitter = api.listen(function (listenErr, event) {
      if (listenErr) {
        console.error("[listen-echo-all] listen error:", listenErr && (listenErr.error || listenErr.message || listenErr));
        return;
      }

      if (!event) return;

      if (!silent) {
        var chatJid = event.e2ee && event.e2ee.chatJid;
        var senderJid = event.e2ee && event.e2ee.senderJid;
        var body = typeof event.body === "string" ? event.body : "";
        console.log(
          "[listen-echo-all]",
          nowIso(),
          "type=" + (event.type || "unknown"),
          "threadID=" + (event.threadID || ""),
          "chatJid=" + (chatJid || ""),
          "senderID=" + (event.senderID || ""),
          "senderJid=" + (senderJid || ""),
          "body=" + body
        );
      }

      if (event.type === "message") {
        echoRegular(event);
        return;
      }

      if (event.type === "e2ee_message") {
        echoE2EE(event);
      }
    });

    api.connectE2EE(function (connectErr) {
      if (connectErr) {
        console.error("[listen-echo-all] connectE2EE failed:", connectErr && (connectErr.error || connectErr.message || connectErr));
        cleanupAndExit(1, "connect-error");
        return;
      }

      console.log("[listen-echo-all] Listening and auto-echoing regular + E2EE messages...");
    });
  }
);

if (maxMs > 0) {
  timer = setTimeout(function () {
    cleanupAndExit(0, "timeout");
  }, maxMs);
}

process.on("SIGINT", function () {
  cleanupAndExit(0, "sigint");
});
