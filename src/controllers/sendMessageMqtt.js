"use strict";

var utils = require("../utils");
var log = require("npmlog");

module.exports = function (defaultFuncs, api, ctx) {
  function uploadAttachment(attachments, callback) {
    callback = callback || function () {};
    var uploads = [];

    for (var i = 0; i < attachments.length; i++) {
      if (!utils.isReadableStream(attachments[i])) {
        throw {
          error:
            "Attachment should be a readable stream and not " +
            utils.getType(attachments[i]) +
            "."
        };
      }

      var form = {
        upload_1024: attachments[i],
        voice_clip: "true"
      };

      uploads.push(
        defaultFuncs
          .postFormData(
            "https://upload.facebook.com/ajax/mercury/upload.php",
            ctx.jar,
            form,
            {}
          )
          .then(utils.parseAndCheckLogin(ctx, defaultFuncs))
          .then(function (resData) {
            if (resData.error) throw resData;
            return resData.payload.metadata[0];
          })
      );
    }

    Promise.all(uploads)
      .then(function (resData) {
        callback(null, resData);
      })
      .catch(function (err) {
        log.error("uploadAttachment", err);
        return callback(err);
      });
  }

  var variance = 0;
  function epochID() {
    variance = (variance + 0.1) % 5;
    return Math.floor(Date.now() * (4194304 + variance));
  }

  var emojiSizes = { small: 1, medium: 2, large: 3 };

  function handleEmoji(msg, form, callback, cb) {
    if (msg.emojiSize != null && msg.emoji == null) {
      return callback({ error: "emoji property is empty" });
    }
    if (msg.emoji) {
      if (!msg.emojiSize) msg.emojiSize = "small";
      if (
        msg.emojiSize !== "small" &&
        msg.emojiSize !== "medium" &&
        msg.emojiSize !== "large" &&
        (isNaN(msg.emojiSize) || msg.emojiSize < 1 || msg.emojiSize > 3)
      ) {
        return callback({ error: "emojiSize property is invalid" });
      }

      form.payload.tasks[0].payload.send_type = 1;
      form.payload.tasks[0].payload.text = msg.emoji;
      form.payload.tasks[0].payload.hot_emoji_size = !isNaN(msg.emojiSize)
        ? msg.emojiSize
        : emojiSizes[msg.emojiSize];
    }
    cb();
  }

  function handleSticker(msg, form, callback, cb) {
    if (msg.sticker) {
      form.payload.tasks[0].payload.send_type = 2;
      form.payload.tasks[0].payload.sticker_id = msg.sticker;
    }
    cb();
  }

  function handleAttachment(msg, form, callback, cb) {
    if (msg.attachment) {
      form.payload.tasks[0].payload.send_type = 3;
      form.payload.tasks[0].payload.attachment_fbids = [];
      if (form.payload.tasks[0].payload.text == "") {
        form.payload.tasks[0].payload.text = null;
      }
      if (utils.getType(msg.attachment) !== "Array") {
        msg.attachment = [msg.attachment];
      }

      uploadAttachment(msg.attachment, function (err, files) {
        if (err) return callback(err);
        files.forEach(function (file) {
          var key = Object.keys(file);
          var type = key[0];
          form.payload.tasks[0].payload.attachment_fbids.push(file[type]);
        });
        cb();
      });
    } else {
      cb();
    }
  }

  function handleMention(msg, form, callback, cb) {
    if (msg.mentions) {
      form.payload.tasks[0].payload.send_type = 1;
      var arrayIds = [];
      var arrayOffsets = [];
      var arrayLengths = [];
      var mentionTypes = [];

      for (var i = 0; i < msg.mentions.length; i++) {
        var mention = msg.mentions[i];
        var tag = mention.tag;
        if (typeof tag !== "string") {
          return callback({ error: "Mention tags must be strings." });
        }

        var offset = msg.body.indexOf(tag, mention.fromIndex || 0);
        if (offset < 0) {
          log.warn("handleMention", 'Mention for "' + tag + '" not found in message string.');
        }
        if (mention.id == null) {
          log.warn("handleMention", "Mention id should be non-null.");
        }

        arrayIds.push(mention.id || 0);
        arrayOffsets.push(offset);
        arrayLengths.push(tag.length);
        mentionTypes.push("p");
      }

      form.payload.tasks[0].payload.mention_data = {
        mention_ids: arrayIds.join(","),
        mention_offsets: arrayOffsets.join(","),
        mention_lengths: arrayLengths.join(","),
        mention_types: mentionTypes.join(",")
      };
    }
    cb();
  }

  function handleLocation(msg, form, callback, cb) {
    if (msg.location) {
      if (msg.location.latitude == null || msg.location.longitude == null) {
        return callback({ error: "location property needs both latitude and longitude" });
      }

      form.payload.tasks[0].payload.send_type = 1;
      form.payload.tasks[0].payload.location_data = {
        coordinates: {
          latitude: msg.location.latitude,
          longitude: msg.location.longitude
        },
        is_current_location: !!msg.location.current,
        is_live_location: !!msg.location.live
      };
    }
    cb();
  }

  function send(form, callback, replyToMessage) {
    if (replyToMessage) {
      form.payload.tasks[0].payload.reply_metadata = {
        reply_source_id: replyToMessage,
        reply_source_type: 1,
        reply_type: 0
      };
    }

    var mqttClient = ctx.mqttClient;
    if (!mqttClient) {
      return callback({ error: "MQTT client is not connected. Call listenMqtt first." });
    }

    form.payload.tasks.forEach(function (task) {
      task.payload = JSON.stringify(task.payload);
    });
    form.payload = JSON.stringify(form.payload);

    return mqttClient.publish("/ls_req", JSON.stringify(form), function (err, data) {
      if (err) {
        log.error("sendMessageMqtt", err);
        callback(err);
      } else {
        callback(null, data);
      }
    });
  }

  return function sendMessageMqtt(msg, threadID, callback, replyToMessage) {
    if (
      !callback &&
      (utils.getType(threadID) === "Function" || utils.getType(threadID) === "AsyncFunction")
    ) {
      return threadID({ error: "Pass a threadID as a second argument." });
    }

    if (!replyToMessage && utils.getType(callback) === "String") {
      replyToMessage = callback;
      callback = function () {};
    }

    if (!callback) callback = function () {};

    var msgType = utils.getType(msg);
    if (msgType !== "String" && msgType !== "Object") {
      return callback({
        error: "Message should be of type string or object and not " + msgType + "."
      });
    }
    if (msgType === "String") {
      msg = { body: msg };
    }

    var timestamp = Date.now();
    var epoch = timestamp << 22;
    var otid = epoch + Math.floor(Math.random() * 4194304);
    var threadIDString = threadID.toString();

    var form = {
      app_id: "2220391788200892",
      payload: {
        tasks: [
          {
            label: "46",
            payload: {
              thread_id: threadIDString,
              otid: otid.toString(),
              source: 0,
              send_type: 1,
              sync_group: 1,
              text: msg.body != null && msg.body != undefined ? msg.body.toString() : "",
              initiating_source: 1,
              skip_url_preview_gen: 0
            },
            queue_name: threadIDString,
            task_id: 0,
            failure_count: null
          },
          {
            label: "21",
            payload: {
              thread_id: threadIDString,
              last_read_watermark_ts: Date.now(),
              sync_group: 1
            },
            queue_name: threadIDString,
            task_id: 1,
            failure_count: null
          }
        ],
        epoch_id: epochID(),
        version_id: "6120284488008082",
        data_trace_id: null
      },
      request_id: 1,
      type: 3
    };

    handleEmoji(msg, form, callback, function () {
      handleLocation(msg, form, callback, function () {
        handleMention(msg, form, callback, function () {
          handleSticker(msg, form, callback, function () {
            handleAttachment(msg, form, callback, function () {
              send(form, callback, replyToMessage);
            });
          });
        });
      });
    });
  };
};
