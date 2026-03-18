"use strict";

var log = require("npmlog");

var dynamicImport = null;
function getDynamicImport() {
  if (!dynamicImport) {
    dynamicImport = new Function("specifier", "return import(specifier);");
  }
  return dynamicImport;
}

function isPromiseLike(value) {
  return value && typeof value.then === "function";
}

function callUserCallback(globalCallback, err, message) {
  if (typeof globalCallback !== "function") {
    return;
  }

  try {
    var result = globalCallback(err, message);
    if (isPromiseLike(result)) {
      result.catch(function (cbErr) {
        log.error("e2ee", cbErr);
      });
    }
  } catch (cbErr) {
    log.error("e2ee", cbErr);
  }
}

function parseMentions(mentionsArray, text) {
  var mentions = {};
  if (!Array.isArray(mentionsArray) || !text) {
    return mentions;
  }

  mentionsArray.forEach(function (mention) {
    if (!mention || mention.userId == null) {
      return;
    }

    var offset = Number(mention.offset || 0);
    var length = Number(mention.length || 0);
    mentions[String(mention.userId)] = text.substring(offset, offset + length);
  });

  return mentions;
}

function normalizeAttachment(attachment) {
  if (!attachment || typeof attachment !== "object") {
    return attachment;
  }

  var mappedType = attachment.type;
  if (mappedType === "file") {
    mappedType = "file";
  }

  return {
    type: mappedType,
    ID: attachment.stickerId != null ? String(attachment.stickerId) : undefined,
    url: attachment.url,
    filename: attachment.fileName,
    mimeType: attachment.mimeType,
    fileSize: attachment.fileSize != null ? String(attachment.fileSize) : undefined,
    width: attachment.width,
    height: attachment.height,
    duration: attachment.duration,
    previewUrl: attachment.previewUrl,
    description: attachment.description,
    source: attachment.sourceText,
    mediaKey: attachment.mediaKey,
    mediaSha256: attachment.mediaSha256,
    mediaEncSha256: attachment.mediaEncSha256,
    directPath: attachment.directPath,
    latitude: attachment.latitude,
    longitude: attachment.longitude,
    isE2EE: true
  };
}

function mapE2EEMessage(event) {
  var text = event && event.text ? String(event.text) : "";
  var senderId = event && event.senderId != null ? String(event.senderId) : "";
  var threadId = event && event.threadId != null ? String(event.threadId) : "";

  return {
    type: "e2ee_message",
    senderID: senderId,
    body: text,
    threadID: threadId,
    messageID: event.id,
    attachments: Array.isArray(event.attachments)
      ? event.attachments.map(normalizeAttachment)
      : [],
    mentions: parseMentions(event.mentions, text),
    timestamp: event.timestampMs != null ? Number(event.timestampMs) : Date.now(),
    isGroup: /@group\.facebook\.com$/i.test(event.chatJid || ""),
    isE2EE: true,
    e2ee: {
      chatJid: event.chatJid,
      senderJid: event.senderJid,
      replyTo: event.replyTo || null,
      rawMentions: event.mentions || []
    },
    args: text.trim() ? text.trim().split(/\s+/) : []
  };
}

function mapE2EEReaction(event) {
  return {
    type: "e2ee_message_reaction",
    threadID: event && event.chatJid ? String(event.chatJid) : "",
    messageID: event ? event.messageId : undefined,
    reaction: event ? event.reaction : undefined,
    senderID: event && event.senderId != null ? String(event.senderId) : undefined,
    userID: event && event.senderId != null ? String(event.senderId) : undefined,
    isE2EE: true,
    e2ee: {
      chatJid: event ? event.chatJid : undefined,
      senderJid: event ? event.senderJid : undefined
    }
  };
}

function mapE2EEReceipt(event) {
  return {
    type: "e2ee_receipt",
    isE2EE: true,
    e2ee: {
      receiptType: event ? event.type : undefined,
      chatJid: event ? event.chat : undefined,
      senderJid: event ? event.sender : undefined,
      messageIds: event ? event.messageIds : []
    }
  };
}

function toCookiesObjectFromJar(ctx) {
  var cookies = {};
  var jarCookies = [];
  try {
    jarCookies = ctx.jar.getCookies("https://www.facebook.com");
  } catch (_) {
    jarCookies = [];
  }

  jarCookies.forEach(function (cookie) {
    if (!cookie || !cookie.key) {
      return;
    }
    cookies[cookie.key] = cookie.value;
  });

  if (!cookies.c_user && cookies.i_user) {
    cookies.c_user = cookies.i_user;
  }

  return cookies;
}

function normalizeMediaInput(input) {
  if (Buffer.isBuffer(input)) {
    return input;
  }

  if (Array.isArray(input)) {
    return Buffer.from(input);
  }

  if (input && input.type === "Buffer" && Array.isArray(input.data)) {
    return Buffer.from(input.data);
  }

  if (typeof input === "string") {
    return Buffer.from(input, "base64");
  }

  throw new Error("data must be a Buffer, byte array, Buffer JSON, or base64 string");
}

function createBridge(ctx) {
  if (ctx._e2eeBridge) {
    return ctx._e2eeBridge;
  }

  var state = {
    client: null,
    connected: false,
    connectingPromise: null,
    listenerAttached: false,
    lastGlobalCallback: null,
    lastReadyPayload: null
  };

  function ensureSupportedOptions() {
    if (ctx.globalOptions.enableE2EE === false) {
      throw new Error("E2EE is disabled. Set option enableE2EE=true to use E2EE APIs.");
    }
  }

  async function loadClientClass() {
    var mod;
    try {
      mod = await getDynamicImport()("meta-messenger.js");
    } catch (err) {
      var hint = "Install optional dependency with: npm i meta-messenger.js";
      throw new Error("Cannot load meta-messenger.js for E2EE support. " + hint + ". " + (err && err.message ? err.message : String(err)));
    }

    if (!mod || !mod.Client) {
      throw new Error("meta-messenger.js loaded but Client export was not found");
    }

    return mod.Client;
  }

  function attachClientEvents(globalCallback) {
    if (!state.client || state.listenerAttached) {
      return;
    }

    state.listenerAttached = true;

    state.client.on("ready", function (payload) {
      state.lastReadyPayload = payload;
      callUserCallback(globalCallback || state.lastGlobalCallback, null, {
        type: "e2ee_ready",
        isE2EE: true,
        data: payload || null
      });
    });

    state.client.on("fullyReady", function () {
      callUserCallback(globalCallback || state.lastGlobalCallback, null, {
        type: "e2ee_fully_ready",
        isE2EE: true
      });
    });

    state.client.on("e2eeConnected", function () {
      callUserCallback(globalCallback || state.lastGlobalCallback, null, {
        type: "e2ee_connected",
        isE2EE: true
      });
    });

    state.client.on("deviceDataChanged", function (payload) {
      if (payload && payload.deviceData) {
        ctx._e2eeDeviceData = payload.deviceData;
      }
      callUserCallback(globalCallback || state.lastGlobalCallback, null, {
        type: "e2ee_device_data_changed",
        isE2EE: true,
        deviceData: payload ? payload.deviceData : undefined
      });
    });

    state.client.on("e2eeMessage", function (event) {
      callUserCallback(globalCallback || state.lastGlobalCallback, null, mapE2EEMessage(event));
    });

    state.client.on("e2eeReaction", function (event) {
      callUserCallback(globalCallback || state.lastGlobalCallback, null, mapE2EEReaction(event));
    });

    state.client.on("e2eeReceipt", function (event) {
      callUserCallback(globalCallback || state.lastGlobalCallback, null, mapE2EEReceipt(event));
    });

    state.client.on("error", function (err) {
      callUserCallback(globalCallback || state.lastGlobalCallback, err || new Error("Unknown E2EE error"));
    });

    state.client.on("disconnected", function (info) {
      state.connected = false;
      callUserCallback(globalCallback || state.lastGlobalCallback, null, {
        type: "e2ee_disconnected",
        isE2EE: true,
        data: info || null
      });
    });
  }

  async function connect(globalCallback) {
    ensureSupportedOptions();
    if (typeof globalCallback === "function") {
      state.lastGlobalCallback = globalCallback;
    }

    if (state.connected && state.client) {
      return state.client;
    }

    if (state.connectingPromise) {
      return state.connectingPromise;
    }

    state.connectingPromise = (async function () {
      var Client = await loadClientClass();

      if (!state.client) {
        var cookies = toCookiesObjectFromJar(ctx);
        if (!cookies.c_user || !cookies.xs) {
          throw new Error("Cannot start E2EE client because c_user/xs cookies are missing");
        }

        var options = {
          enableE2EE: true,
          e2eeMemoryOnly: ctx.globalOptions.e2eeMemoryOnly !== false,
          autoReconnect: ctx.globalOptions.autoReconnect !== false,
          logLevel: "none"
        };

        if (ctx.globalOptions.e2eeDevicePath) {
          options.devicePath = ctx.globalOptions.e2eeDevicePath;
        }
        if (ctx.globalOptions.e2eeDeviceData) {
          options.deviceData = ctx.globalOptions.e2eeDeviceData;
        }

        state.client = new Client(cookies, options);
        attachClientEvents(globalCallback);
      }

      await state.client.connect();
      state.connected = true;
      return state.client;
    })();

    try {
      return await state.connectingPromise;
    } finally {
      state.connectingPromise = null;
    }
  }

  async function ensureClient() {
    ensureSupportedOptions();
    if (state.connected && state.client) {
      return state.client;
    }
    return connect();
  }

  async function disconnect() {
    if (!state.client) {
      state.connected = false;
      return;
    }

    try {
      await state.client.disconnect();
    } finally {
      state.connected = false;
      state.connectingPromise = null;
      state.listenerAttached = false;
      state.client = null;
    }
  }

  var bridge = {
    connect: connect,
    disconnect: disconnect,
    ensureClient: ensureClient,
    isConnected: function () {
      return !!(state.client && state.connected);
    },
    getDeviceData: async function () {
      var client = await ensureClient();
      return client.getDeviceData();
    },
    getState: function () {
      return state;
    },
    sendMessage: async function (chatJid, text, options) {
      var client = await ensureClient();
      return client.sendE2EEMessage(chatJid, text, options || {});
    },
    sendReaction: async function (chatJid, messageId, senderJid, emoji) {
      var client = await ensureClient();
      return client.sendE2EEReaction(chatJid, messageId, senderJid, emoji);
    },
    sendTyping: async function (chatJid, isTyping) {
      var client = await ensureClient();
      return client.sendE2EETyping(chatJid, isTyping !== false);
    },
    unsendMessage: async function (chatJid, messageId) {
      var client = await ensureClient();
      return client.unsendE2EEMessage(chatJid, messageId);
    },
    downloadMedia: async function (options) {
      var client = await ensureClient();
      var result = await client.downloadE2EEMedia({
        directPath: options.directPath,
        mediaKey: options.mediaKey,
        mediaSha256: options.mediaSha256,
        mediaEncSha256: options.mediaEncSha256,
        mediaType: options.mediaType,
        mimeType: options.mimeType,
        fileSize: options.fileSize
      });

      return {
        data: result.data,
        mimeType: result.mimeType,
        fileSize: Number(result.fileSize)
      };
    },
    sendMedia: async function (chatJid, mediaType, data, payloadOptions) {
      var client = await ensureClient();
      var buffer = normalizeMediaInput(data);
      var opts = payloadOptions || {};
      var normalizedType = String(mediaType || "").toLowerCase();

      switch (normalizedType) {
        case "image":
          return client.sendE2EEImage(chatJid, buffer, opts.mimeType || "image/jpeg", {
            caption: opts.caption || "",
            width: opts.width,
            height: opts.height,
            replyToId: opts.replyToId,
            replyToSenderJid: opts.replyToSenderJid
          });
        case "video":
          return client.sendE2EEVideo(chatJid, buffer, opts.mimeType || "video/mp4", {
            caption: opts.caption || "",
            duration: opts.duration,
            width: opts.width,
            height: opts.height,
            replyToId: opts.replyToId,
            replyToSenderJid: opts.replyToSenderJid
          });
        case "audio":
        case "voice":
          return client.sendE2EEAudio(chatJid, buffer, opts.mimeType || "audio/mpeg", {
            ptt: !!opts.ptt,
            duration: opts.duration,
            replyToId: opts.replyToId,
            replyToSenderJid: opts.replyToSenderJid
          });
        case "file":
        case "document":
          return client.sendE2EEDocument(chatJid, buffer, opts.filename || "file.bin", opts.mimeType || "application/octet-stream", {
            replyToId: opts.replyToId,
            replyToSenderJid: opts.replyToSenderJid
          });
        case "sticker":
          return client.sendE2EESticker(chatJid, buffer, opts.mimeType || "image/webp", {
            replyToId: opts.replyToId,
            replyToSenderJid: opts.replyToSenderJid
          });
        default:
          throw new Error("Unsupported E2EE mediaType: " + normalizedType);
      }
    }
  };

  ctx._e2eeBridge = bridge;
  return bridge;
}

module.exports = {
  createBridge: createBridge
};
