"use strict";

var Readable = require("stream").Readable;

function getType(obj) {
  return Object.prototype.toString.call(obj).slice(8, -1);
}

describe("sendMessage auto E2EE", function () {
  beforeEach(function () {
    jest.resetModules();
    jest.clearAllMocks();
  });

  function loadSendMessageWithMocks(sendMessageE2EE, sendMediaE2EE) {
    var loaded;
    jest.isolateModules(function () {
      jest.doMock("../../../src/e2ee/thread", function () {
        return { isE2EEChatJid: jest.fn().mockReturnValue(true) };
      });
      jest.doMock("../../../src/utils", function () {
        return {
          getType: getType,
          isReadableStream: function (v) {
            return v && typeof v.on === "function";
          }
        };
      });

      var factory = require("../../../src/controllers/sendMessage");
      loaded = factory({}, {
        sendMessageE2EE: sendMessageE2EE,
        sendMediaE2EE: sendMediaE2EE
      }, {});
    });
    return loaded;
  }

  test("splits text + attachment into text then media on E2EE chatJid", async function () {
    var sendMessageE2EE = jest.fn().mockResolvedValue({ messageID: "text-id" });
    var sendMediaE2EE = jest.fn().mockResolvedValue({ messageID: "media-id" });
    var fn = loadSendMessageWithMocks(sendMessageE2EE, sendMediaE2EE);

    var attachment = Readable.from([Buffer.from("img")]);
    attachment.path = "/tmp/photo.jpg";

    var result = await fn(
      { body: "hello", attachment: attachment },
      "123@user.facebook.com"
    );

    expect(sendMessageE2EE).toHaveBeenCalledTimes(1);
    expect(sendMessageE2EE).toHaveBeenCalledWith(
      "123@user.facebook.com",
      expect.objectContaining({ text: "hello" })
    );

    expect(sendMediaE2EE).toHaveBeenCalledTimes(1);
    expect(sendMediaE2EE).toHaveBeenCalledWith(
      "123@user.facebook.com",
      "image",
      expect.any(Buffer),
      expect.objectContaining({ filename: "photo.jpg" })
    );

    expect(result).toEqual({ messageID: "media-id" });
  });

  test("sends attachment-only E2EE without text task", async function () {
    var sendMessageE2EE = jest.fn().mockResolvedValue({ messageID: "text-id" });
    var sendMediaE2EE = jest.fn().mockResolvedValue({ messageID: "doc-id" });
    var fn = loadSendMessageWithMocks(sendMessageE2EE, sendMediaE2EE);

    var attachment = Readable.from([Buffer.from("doc")]);
    attachment.path = "/tmp/file.bin";

    var result = await fn(
      { attachment: attachment },
      "456@group.facebook.com"
    );

    expect(sendMessageE2EE).not.toHaveBeenCalled();
    expect(sendMediaE2EE).toHaveBeenCalledTimes(1);
    expect(sendMediaE2EE).toHaveBeenCalledWith(
      "456@group.facebook.com",
      "document",
      expect.any(Buffer),
      expect.objectContaining({ filename: "file.bin" })
    );
    expect(result).toEqual({ messageID: "doc-id" });
  });

  test("returns validation error when unsupported rich fields are used in auto E2EE", async function () {
    var fn = loadSendMessageWithMocks(jest.fn(), jest.fn());

    await new Promise(function (resolve) {
      fn(
        { body: "x", emoji: "👍" },
        "111@user.facebook.com",
        function (err) {
          expect(err).toEqual(
            expect.objectContaining({
              error: "Auto E2EE in sendMessage currently supports text and attachment only."
            })
          );
          resolve();
        }
      );
    });
  });
});
