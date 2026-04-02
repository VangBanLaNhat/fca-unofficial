"use strict";

var fs = require("fs");
var path = require("path");

try {
  require("dotenv").config({ path: path.resolve(process.cwd(), "test/config.env") });
} catch (_) {
  // Ignore when dotenv is unavailable and env vars are injected by shell/CI.
}

var login = require("../../src/index.js");

var appStatePath = process.env.APPSTATE_PATH || path.join(__dirname, "../appstate.json");
var hasAppState = fs.existsSync(appStatePath);

var e2eeUserRaw = String(process.env.E2EE_TEST_USER_ID || "").trim();
var e2eeGroupRaw = String(process.env.E2EE_TEST_GROUP_ID || "").trim();
var hasE2EETargets = Boolean(e2eeUserRaw && e2eeGroupRaw);

var describeWithE2EEConfig = hasAppState && hasE2EETargets ? describe : describe.skip;

function normalizeChatJid(raw, type) {
  if (!raw) return "";
  if (/@(msgr(\.fb)?|user\.facebook\.com|group\.facebook\.com|g\.us)$/i.test(raw)) return raw;
  return raw + (type === "group" ? "@g.us" : "@msgr");
}

describeWithE2EEConfig("AppState E2EE sendMessageE2EE", function () {
  jest.setTimeout(300000);

  var api = null;
  var listenHandle = null;
  var fullyReadySeen = false;
  var seenGroupChatJids = Object.create(null);
  var inboundUserActivitySeen = false;
  var e2eeUnavailableReason = null;
  var e2eeUserChatJid = normalizeChatJid(e2eeUserRaw, "user");
  var e2eeGroupChatJid = normalizeChatJid(e2eeGroupRaw, "group");

  function extractBaseId(chatJid) {
    var m = String(chatJid || "").match(/^(\d+)(?:@|$)/);
    return m ? m[1] : "";
  }

  var userBaseId = extractBaseId(e2eeUserChatJid);

  function delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function waitForFullyReady(timeoutMs) {
    return new Promise(function (resolve) {
      if (fullyReadySeen) {
        return resolve(true);
      }

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

  function waitForWarmup(timeoutMs) {
    return new Promise(function (resolve) {
      if (inboundUserActivitySeen) {
        return resolve(true);
      }

      console.log("[e2ee-test] waiting warmup", "mode=configured-user", "target=" + e2eeUserChatJid, "timeoutMs=" + timeoutMs);
      var started = Date.now();
      var timer = setInterval(function () {
        if (inboundUserActivitySeen) {
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

  function sendWithRetry(chatJid, text, attempts) {
    var maxAttempts = attempts || 1;

    function once(remaining) {
      var startedAt = Date.now();
      console.log("[e2ee-test] send start", chatJid, new Date(startedAt).toISOString());

      return api
        .sendMessageE2EE(chatJid, { text: text })
        .then(function (info) {
          console.log("[e2ee-test] send ok", chatJid, "elapsedMs=" + (Date.now() - startedAt));
          return info;
        })
        .catch(function (err) {
          var message = String(err && (err.error || err.message || err));
          console.log("[e2ee-test] send err", chatJid, message, "elapsedMs=" + (Date.now() - startedAt));

          if (/timed out waiting for message send response/i.test(message) && remaining > 1) {
            return delay(2000).then(function () {
              return once(remaining - 1);
            });
          }

          throw err;
        });
    }

    return once(maxAttempts);
  }

  beforeAll(function () {
    var appState = JSON.parse(fs.readFileSync(appStatePath, "utf8"));

    return new Promise(function (resolve) {
      login(
        { appState: appState },
        {
          logLevel: "silent",
          enableE2EE: true,
          e2eeMemoryOnly: true
        },
        function (err, localApi) {
          if (err) {
            e2eeUnavailableReason = String(err && err.error ? err.error : err);
            return resolve();
          }
          api = localApi;
          if (!api || typeof api.sendMessageE2EE !== "function") {
            e2eeUnavailableReason = "API is missing sendMessageE2EE controller";
            return resolve();
          }

          listenHandle = api.listen(function (listenErr, evt) {
            if (listenErr) {
              console.log("[e2ee-test] listen err", String(listenErr && (listenErr.error || listenErr.message || listenErr)));
              return;
            }

            if (evt && (evt.type === "fullyReady")) {
              fullyReadySeen = true;
            }

            var chatJid = evt && evt.e2ee && evt.e2ee.chatJid;
            var senderJid = evt && evt.e2ee && evt.e2ee.senderJid;

            if (evt && evt.isE2EE) {
              console.log("[e2ee-test] e2ee event", evt.type || "unknown", "chatJid=" + (chatJid || ""), "senderJid=" + (senderJid || ""));
            }

            if (chatJid && /@g\.us$/i.test(chatJid)) {
              if (!seenGroupChatJids[chatJid]) {
                seenGroupChatJids[chatJid] = true;
                console.log("[e2ee-test] discovered group chatJid", chatJid);
              }

              console.log("[e2ee-test] group event", evt.type || "unknown", chatJid);
            }

            var isUserThread = chatJid && chatJid === e2eeUserChatJid;
            var fromConfiguredUser = senderJid && userBaseId && senderJid.indexOf(userBaseId + ":") === 0;
            if (isUserThread && fromConfiguredUser) {
              if (!inboundUserActivitySeen) {
                inboundUserActivitySeen = true;
                console.log("[e2ee-test] inbound user activity detected", chatJid, senderJid);
              }
            }
          });

          api.connectE2EE(function (connectErr) {
            if (connectErr) {
              var message = String(connectErr && connectErr.message ? connectErr.message : connectErr);
              e2eeUnavailableReason = message;
              return resolve();
            }

            waitForFullyReady(15000).then(function (ready) {
              if (!ready) {
                e2eeUnavailableReason = "E2EE setup unavailable: e2ee_fully_ready event not observed within 15000ms";
              }
              resolve();
            });
          });
        }
      );
    });
  });

  afterAll(function () {
    if (!api) return Promise.resolve();

    return new Promise(function (resolve) {
      var settled = false;
      var guard = setTimeout(function () {
        if (settled) return;
        settled = true;
        resolve();
      }, 5000);

      function finish() {
        if (settled) return;
        settled = true;
        clearTimeout(guard);
        resolve();
      }

      function stopListenThenResolve() {
        if (listenHandle && typeof listenHandle.stopListening === "function") {
          return listenHandle.stopListening(function () {
            finish();
          });
        }
        finish();
      }

      if (typeof api.disconnectE2EE !== "function") {
        return stopListenThenResolve();
      }

      api.disconnectE2EE(function () {
        stopListenThenResolve();
      });
    });
  });

  test("should send E2EE text message to configured E2EE user", function () {
    if (e2eeUnavailableReason) {
      throw new Error("E2EE setup unavailable: " + e2eeUnavailableReason);
    }

    var body = "e2ee-user-" + Date.now();

    var gate = waitForWarmup(30000);

    return gate.then(function (ready) {
      if (!ready) {
        throw new Error("Warmup not satisfied within 30000ms (mode=configured-user). Send a message from E2EE_TEST_USER_ID to bot, then re-run test.");
      }

      return sendWithRetry(e2eeUserChatJid, body, 1);
    }).then(function (info) {
      if (!info || !info.messageID) {
        throw new Error("E2EE user send did not return messageID");
      }

      if (info.threadID !== e2eeUserChatJid) {
        throw new Error("E2EE user send threadID mismatch: expected " + e2eeUserChatJid + ", got " + info.threadID);
      }
    });
  });

  test("should send E2EE text message to configured E2EE group", function () {
    if (e2eeUnavailableReason) {
      throw new Error("E2EE setup unavailable: " + e2eeUnavailableReason);
    }

    var body = "e2ee-group-" + Date.now();

    var gate = waitForWarmup(30000);

    return gate.then(function (ready) {
      if (!ready) {
        throw new Error("Warmup not satisfied within 30000ms (mode=configured-user). Send a message from E2EE_TEST_USER_ID to bot, then re-run test.");
      }

      return sendWithRetry(e2eeGroupChatJid, body, 1);
    }).then(function (info) {
      if (!info || !info.messageID) {
        throw new Error("E2EE group send did not return messageID");
      }

      if (info.threadID !== e2eeGroupChatJid) {
        throw new Error("E2EE group send threadID mismatch: expected " + e2eeGroupChatJid + ", got " + info.threadID);
      }
    });
  });
});
