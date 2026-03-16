"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");

try {
  require("dotenv").config({ path: path.resolve(process.cwd(), "test/config.env") });
} catch (_) {
  // Ignore when dotenv is unavailable in environments that inject env variables directly.
}

var login = require("../../src/index.js");
var controllers = require("../../src/controllers");

var appStatePath = process.env.APPSTATE_PATH || path.join(__dirname, "../appstate.json");
var sendUserIDs = String(process.env.FCA_TEST_USER_IDS || "")
  .split(",")
  .map(function (item) {
    return item.trim();
  })
  .filter(Boolean);
var sendGroupID = process.env.FCA_TEST_GROUP_ID || process.env.SEND_THREAD_ID || "7222397741187183";
var hasAppState = fs.existsSync(appStatePath);

var describeWithAppState = hasAppState ? describe : describe.skip;

describeWithAppState("AppState login + controller smoke", function () {
  jest.setTimeout(45000);

  var api = null;
  var userID = null;

  function readAppState() {
    return JSON.parse(fs.readFileSync(appStatePath, "utf8"));
  }

  function toPromise(fn) {
    return new Promise(function (resolve, reject) {
      fn(function (err, data) {
        if (err) return reject(err);
        resolve(data);
      });
    });
  }

  function toResult(fn) {
    return new Promise(function (resolve) {
      fn(function (err, data) {
        resolve({ err: err, data: data });
      });
    });
  }

  function isKnownTransientFacebookError(err) {
    var nested = err && err.res ? err.res : null;

    return (
      err &&
      (err.error === 1357004 ||
        (nested && nested.error === 1357004) ||
        err.error === "Not logged in." ||
        (nested && nested.errorSummary === "Sorry, something went wrong") ||
        err.errorSummary === "Sorry, something went wrong")
    );
  }

  function isThreadDisabledError(err) {
    var nested = err && err.res ? err.res : null;
    return (
      err &&
      (err.error === 1545116 ||
        (nested && nested.error === 1545116) ||
        err.errorSummary === "Thread disabled" ||
        (nested && nested.errorSummary === "Thread disabled"))
    );
  }

  function assertDataOrKnownTransient(result, validator, label) {
    if (!result.err) {
      validator(result.data);
      return;
    }

    assert(
      isKnownTransientFacebookError(result.err),
      label + " failed with unexpected error: " + JSON.stringify(result.err)
    );
  }

  beforeAll(function () {
    return new Promise(function (resolve, reject) {
      login({ appState: readAppState() }, { logLevel: "silent" }, function (err, localApi) {
        if (err) return reject(err);

        api = localApi;
        userID = api && api.getCurrentUserID ? api.getCurrentUserID() : null;

        if (!api || !userID) {
          return reject(new Error("Login succeeded but API/userID is invalid."));
        }

        resolve();
      });
    });
  });

  afterAll(function () {
    if (!api || typeof api.logout !== "function") return Promise.resolve();

    return new Promise(function (resolve) {
      api.logout(function () {
        resolve();
      });
    });
  });

  test("should expose controller methods on api", function () {
    var controllerNames = Object.keys(controllers);

    controllerNames.forEach(function (name) {
      if (name === "threadColors") {
        assert(api.threadColors && typeof api.threadColors === "object");
        return;
      }

      assert.strictEqual(typeof api[name], "function", "Missing api method: " + name);
    });
  });

  test("should keep basic identity helpers working", function () {
    assert.strictEqual(typeof api.getCurrentUserID, "function");
    assert.strictEqual(api.getCurrentUserID(), userID);

    var appState = api.getAppState();
    assert(Array.isArray(appState));
    assert(appState.length > 0);
  });

  test("should send message to configured user list and group", async function () {
    assert(sendUserIDs.length > 0, "FCA_TEST_USER_IDS is required for send tests");

    var userBody = "controller-smoke-user-" + Date.now();
    var userResult = null;
    var userTarget = null;
    var userErrors = [];

    for (var i = 0; i < sendUserIDs.length; i++) {
      var candidate = sendUserIDs[i];
      var candidateResult = await toResult(function (cb) {
        api.sendMessage({ body: userBody }, candidate, cb);
      });

      if (!candidateResult.err) {
        userResult = candidateResult;
        userTarget = candidate;
        break;
      }

      userErrors.push({ id: candidate, err: candidateResult.err });
    }

    if (userResult) {
      assert(userResult.data && userResult.data.threadID, "sendMessage (user) should return message info");
      assert.strictEqual(userResult.data.threadID, userTarget);
      assert(userResult.data.messageID, "sendMessage (user) result should include messageID");
    } else {
      var hasOnlyDisabledThreads = userErrors.length > 0 && userErrors.every(function (entry) {
        return isThreadDisabledError(entry.err);
      });
      assert(
        hasOnlyDisabledThreads,
        "sendMessage to FCA_TEST_USER_IDS failed: " + JSON.stringify(userErrors)
      );
    }

    var groupBody = "controller-smoke-group-" + Date.now();
    var groupResult = await toResult(function (cb) {
      api.sendMessage({ body: groupBody }, sendGroupID, cb);
    });

    assert(!groupResult.err, "sendMessage to FCA_TEST_GROUP_ID failed: " + JSON.stringify(groupResult.err));
    assert(groupResult.data && groupResult.data.threadID, "sendMessage (group) should return message info");
    assert.strictEqual(groupResult.data.threadID, sendGroupID);
    assert(groupResult.data.messageID, "sendMessage (group) result should include messageID");
  });

  test("should call core read-only controllers", async function () {
    var me = await toResult(function (cb) {
      api.getUserInfo(userID, cb);
    });
    assertDataOrKnownTransient(me, function (data) {
      assert(data && data[userID], "getUserInfo did not return current user");
    }, "getUserInfo");

    var threads = await toResult(function (cb) {
      api.getThreadList(1, null, ["INBOX"], cb);
    });
    assertDataOrKnownTransient(threads, function (data) {
      assert(Array.isArray(data), "getThreadList should return an array");
    }, "getThreadList");

    var threadInfo = await toResult(function (cb) {
      api.getThreadInfo(userID, cb);
    });
    assertDataOrKnownTransient(threadInfo, function (data) {
      assert(data && data.threadID, "getThreadInfo returned invalid payload");
    }, "getThreadInfo");
  });

  test("should keep deprecated read-only controllers callable", async function () {
    var listDeprecated = await toResult(function (cb) {
      api.getThreadListDeprecated(0, 1, "inbox", cb);
    });
    assertDataOrKnownTransient(listDeprecated, function (data) {
      assert(Array.isArray(data), "getThreadListDeprecated should return an array");
    }, "getThreadListDeprecated");

    var infoDeprecated = await toResult(function (cb) {
      api.getThreadInfoDeprecated(userID, cb);
    });
    assertDataOrKnownTransient(infoDeprecated, function (data) {
      assert(data && data.threadID, "getThreadInfoDeprecated returned invalid payload");
    }, "getThreadInfoDeprecated");

    var historyDeprecated = await toResult(function (cb) {
      api.getThreadHistoryDeprecated(userID, 1, null, cb);
    });
    assertDataOrKnownTransient(historyDeprecated, function (data) {
      assert(Array.isArray(data), "getThreadHistoryDeprecated should return an array");
    }, "getThreadHistoryDeprecated");
  });
});
