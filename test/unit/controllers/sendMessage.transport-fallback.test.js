"use strict";

function getType(obj) {
  return Object.prototype.toString.call(obj).slice(8, -1);
}

describe("sendMessage transport fallback", function () {
  beforeEach(function () {
    jest.resetModules();
    jest.clearAllMocks();
  });

  function loadSendMessageWithMocks(options) {
    var loaded;

    jest.isolateModules(function () {
      jest.doMock("../../../src/e2ee/thread", function () {
        return { isE2EEChatJid: jest.fn().mockReturnValue(false) };
      });

      jest.doMock("../../../src/utils", function () {
        return {
          getType: getType,
          generateOfflineThreadingID: jest.fn().mockReturnValue("offline-id"),
          generateTimestampRelative: jest.fn().mockReturnValue("Now"),
          generateThreadingID: jest.fn().mockReturnValue("threading-id"),
          getSignatureID: jest.fn().mockReturnValue("signature-id"),
          parseAndCheckLogin: jest.fn().mockImplementation(function () {
            return function (resData) {
              return resData;
            };
          }),
          isReadableStream: function (v) {
            return v && typeof v.on === "function";
          }
        };
      });

      var factory = require("../../../src/controllers/sendMessage");
      loaded = factory(options.defaultFuncs, options.api, options.ctx);
    });

    return loaded;
  }

  test("uses HTTP first and does not call MQTT when HTTP succeeds", async function () {
    var defaultFuncs = {
      post: jest.fn().mockResolvedValue({
        payload: {
          actions: [{
            thread_fbid: "12345",
            message_id: "http-message-id",
            timestamp: 1712000000000
          }]
        }
      })
    };

    var api = {
      sendMessageMqtt: jest.fn()
    };

    var ctx = {
      userID: "10000",
      clientID: "client-id",
      globalOptions: {},
      mqttClient: { connected: true },
      jar: {}
    };

    var fn = loadSendMessageWithMocks({
      defaultFuncs: defaultFuncs,
      api: api,
      ctx: ctx
    });

    var result = await fn("hello", "12345");

    expect(result).toEqual({
      threadID: "12345",
      messageID: "http-message-id",
      timestamp: 1712000000000
    });
    expect(defaultFuncs.post).toHaveBeenCalledTimes(1);
    expect(api.sendMessageMqtt).not.toHaveBeenCalled();
  });

  test("falls back to MQTT when HTTP fails", async function () {
    var defaultFuncs = {
      post: jest.fn().mockRejectedValue({ error: "HTTP failed" })
    };

    var api = {
      sendMessageMqtt: jest.fn().mockImplementation(function (_msg, _threadID, cb) {
        cb(null, { messageID: "mqtt-message-id", threadID: "12345" });
      })
    };

    var ctx = {
      userID: "10000",
      clientID: "client-id",
      globalOptions: {},
      mqttClient: { connected: true },
      jar: {}
    };

    var fn = loadSendMessageWithMocks({
      defaultFuncs: defaultFuncs,
      api: api,
      ctx: ctx
    });

    var result = await fn("hello", "12345");

    expect(result).toEqual({ messageID: "mqtt-message-id", threadID: "12345" });
    expect(api.sendMessageMqtt).toHaveBeenCalledTimes(1);
  });

  test("returns combined error when both HTTP and MQTT fail", async function () {
    var defaultFuncs = {
      post: jest.fn().mockRejectedValue(new Error("HTTP crashed"))
    };

    var api = {
      sendMessageMqtt: jest.fn().mockImplementation(function (_msg, _threadID, cb) {
        cb({ error: "MQTT crashed" });
      })
    };

    var ctx = {
      userID: "10000",
      clientID: "client-id",
      globalOptions: {},
      mqttClient: { connected: true },
      jar: {}
    };

    var fn = loadSendMessageWithMocks({
      defaultFuncs: defaultFuncs,
      api: api,
      ctx: ctx
    });

    await expect(fn("hello", "12345")).rejects.toEqual({
      error: "Both HTTP and MQTT send failed.",
      httpError: "HTTP crashed",
      mqttError: "MQTT crashed"
    });
  });

  test("returns HTTP error when HTTP fails and MQTT fallback is unavailable", async function () {
    var defaultFuncs = {
      post: jest.fn().mockRejectedValue({ error: "HTTP only error" })
    };

    var api = {
      sendMessageMqtt: jest.fn()
    };

    var ctx = {
      userID: "10000",
      clientID: "client-id",
      globalOptions: {},
      mqttClient: { connected: false },
      jar: {}
    };

    var fn = loadSendMessageWithMocks({
      defaultFuncs: defaultFuncs,
      api: api,
      ctx: ctx
    });

    await expect(fn("hello", "12345")).rejects.toEqual({ error: "HTTP only error" });
    expect(api.sendMessageMqtt).not.toHaveBeenCalled();
  });
});
