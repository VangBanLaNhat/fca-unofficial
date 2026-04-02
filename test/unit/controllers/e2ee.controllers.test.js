"use strict";

var Readable = require("stream").Readable;

function getType(obj) {
  return Object.prototype.toString.call(obj).slice(8, -1);
}

describe("E2EE controllers", function () {
  beforeEach(function () {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test("connectE2EE resolves connected true", async function () {
    await new Promise(function (resolve, reject) {
      jest.isolateModules(async function () {
        var connect = jest.fn().mockResolvedValue();
        jest.doMock("../../../src/e2ee/bridge", function () {
          return {
            createBridge: function () {
              return { connect: connect };
            }
          };
        });

        var factory = require("../../../src/controllers/connectE2EE");
        var fn = factory({}, {}, {});

        try {
          var result = await fn();
          expect(connect).toHaveBeenCalledTimes(1);
          expect(result).toEqual({ connected: true });
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  });

  test("disconnectE2EE resolves connected false", async function () {
    await new Promise(function (resolve, reject) {
      jest.isolateModules(async function () {
        var disconnect = jest.fn().mockResolvedValue();
        jest.doMock("../../../src/e2ee/bridge", function () {
          return {
            createBridge: function () {
              return { disconnect: disconnect };
            }
          };
        });

        var factory = require("../../../src/controllers/disconnectE2EE");
        var fn = factory({}, {}, {});

        try {
          var result = await fn();
          expect(disconnect).toHaveBeenCalledTimes(1);
          expect(result).toEqual({ connected: false });
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  });

  test("getE2EEDeviceData returns cached ctx value without bridge call", async function () {
    await new Promise(function (resolve, reject) {
      jest.isolateModules(async function () {
        var getDeviceData = jest.fn().mockResolvedValue("new-data");
        jest.doMock("../../../src/e2ee/bridge", function () {
          return {
            createBridge: function () {
              return { getDeviceData: getDeviceData };
            }
          };
        });

        var ctx = { _e2eeDeviceData: "cached-data" };
        var factory = require("../../../src/controllers/getE2EEDeviceData");
        var fn = factory({}, {}, ctx);

        try {
          var result = await fn();
          expect(result).toBe("cached-data");
          expect(getDeviceData).not.toHaveBeenCalled();
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  });

  test("downloadE2EEMedia validates required options", async function () {
    await new Promise(function (resolve, reject) {
      jest.isolateModules(async function () {
        jest.doMock("../../../src/e2ee/bridge", function () {
          return {
            createBridge: function () {
              return { downloadMedia: jest.fn() };
            }
          };
        });

        var factory = require("../../../src/controllers/downloadE2EEMedia");
        var fn = factory({}, {}, {});

        try {
          await expect(fn({ directPath: "/foo" })).rejects.toThrow(
            "downloadE2EEMedia requires directPath, mediaKey, mediaSha256, mediaType, mimeType, and fileSize"
          );
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  });

  test("sendMessageE2EE falls back to normal send for non-E2EE thread", async function () {
    await new Promise(function (resolve, reject) {
      jest.isolateModules(async function () {
        jest.doMock("../../../src/e2ee/thread", function () {
          return { isE2EEChatJid: jest.fn().mockReturnValue(false) };
        });
        jest.doMock("../../../src/e2ee/bridge", function () {
          return {
            createBridge: function () {
              return { sendMessage: jest.fn() };
            }
          };
        });

        var sendMessage = jest.fn(function (_msg, _threadID, cb) {
          cb(null, { messageID: "normal-1" });
        });

        var factory = require("../../../src/controllers/sendMessageE2EE");
        var fn = factory({}, { sendMessage: sendMessage }, {});

        try {
          var result = await fn("123456", { text: "hello" });
          expect(sendMessage).toHaveBeenCalledTimes(1);
          expect(result).toEqual({ messageID: "normal-1" });
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  });

  test("sendMediaE2EE falls back to normal send with attachment for non-E2EE thread", async function () {
    await new Promise(function (resolve, reject) {
      jest.isolateModules(async function () {
        jest.doMock("../../../src/e2ee/thread", function () {
          return { isE2EEChatJid: jest.fn().mockReturnValue(false) };
        });
        jest.doMock("../../../src/e2ee/bridge", function () {
          return {
            createBridge: function () {
              return { sendMedia: jest.fn() };
            }
          };
        });

        var sendMessage = jest.fn(function (msg, _threadID, cb) {
          expect(msg).toHaveProperty("attachment");
          expect(typeof msg.attachment.on).toBe("function");
          cb(null, { messageID: "normal-media" });
        });

        var factory = require("../../../src/controllers/sendMediaE2EE");
        var fn = factory({}, { sendMessage: sendMessage }, {});

        try {
          var result = await fn("10001", "image", Buffer.from("abc"));
          expect(sendMessage).toHaveBeenCalledTimes(1);
          expect(result).toEqual({ messageID: "normal-media" });
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  });

  test("sendTypingE2EE uses normal typing fallback and end when isTyping=false", async function () {
    await new Promise(function (resolve, reject) {
      jest.isolateModules(async function () {
        jest.doMock("../../../src/e2ee/thread", function () {
          return { isE2EEChatJid: jest.fn().mockReturnValue(false) };
        });
        jest.doMock("../../../src/e2ee/bridge", function () {
          return {
            createBridge: function () {
              return { sendTyping: jest.fn() };
            }
          };
        });

        var endFn = jest.fn(function (cb) {
          cb(null, true);
        });
        var sendTypingIndicator = jest.fn(function (_threadID, cb) {
          cb(null, endFn);
        });

        var factory = require("../../../src/controllers/sendTypingE2EE");
        var fn = factory({}, { sendTypingIndicator: sendTypingIndicator }, {});

        try {
          var result = await fn("111", false);
          expect(sendTypingIndicator).toHaveBeenCalledTimes(1);
          expect(endFn).toHaveBeenCalledTimes(1);
          expect(result).toBe(true);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  });

  test("sendReactionE2EE validates senderJid for E2EE thread", async function () {
    await new Promise(function (resolve, reject) {
      jest.isolateModules(async function () {
        jest.doMock("../../../src/e2ee/thread", function () {
          return { isE2EEChatJid: jest.fn().mockReturnValue(true) };
        });
        jest.doMock("../../../src/e2ee/bridge", function () {
          return {
            createBridge: function () {
              return { sendReaction: jest.fn() };
            }
          };
        });

        var factory = require("../../../src/controllers/sendReactionE2EE");
        var fn = factory({}, { setMessageReaction: jest.fn() }, {});

        try {
          await expect(fn("123@user.facebook.com", "mid.1")).rejects.toThrow(
            "sendReactionE2EE requires senderJid for E2EE threads"
          );
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  });

  test("unsendMessageE2EE falls back to normal unsend for non-E2EE thread", async function () {
    await new Promise(function (resolve, reject) {
      jest.isolateModules(async function () {
        jest.doMock("../../../src/e2ee/thread", function () {
          return { isE2EEChatJid: jest.fn().mockReturnValue(false) };
        });
        jest.doMock("../../../src/e2ee/bridge", function () {
          return {
            createBridge: function () {
              return { unsendMessage: jest.fn() };
            }
          };
        });

        var unsendMessage = jest.fn(function (_messageID, cb) {
          cb(null, true);
        });

        var factory = require("../../../src/controllers/unsendMessageE2EE");
        var fn = factory({}, { unsendMessage: unsendMessage }, {});

        try {
          var result = await fn("12345", "mid.2");
          expect(unsendMessage).toHaveBeenCalledTimes(1);
          expect(result).toBe(true);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  });

  test("e2ee thread matcher accepts user/group chat JIDs", function () {
    jest.dontMock("../../../src/e2ee/thread");
    var thread = require("../../../src/e2ee/thread");

    expect(thread.isE2EEChatJid("123@user.facebook.com")).toBe(true);
    expect(thread.isE2EEChatJid("456@group.facebook.com")).toBe(true);
    expect(thread.isE2EEChatJid("1805602490133470@g.us")).toBe(true);
    expect(thread.isE2EEChatJid("123456789")).toBe(false);
  });
});
