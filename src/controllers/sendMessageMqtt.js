"use strict";

var utils = require("../utils");
var log = require("npmlog");
var bluebird = require("bluebird");

module.exports = function (defaultFuncs, _api, ctx) {
  var mqttVariance = 0;

  function mqttEpochID() {
    mqttVariance = (mqttVariance + 0.1) % 5;
    return Math.floor(Date.now() * (4194304 + mqttVariance));
  }

  function uploadAttachment(attachments, callback) {
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
            if (resData.error) {
              throw resData;
            }
            return resData.payload.metadata[0];
          })
      );
    }

    bluebird
      .all(uploads)
      .then(function (resData) {
        callback(null, resData);
      })
      .catch(function (err) {
        log.error("uploadAttachment", err);
        return callback(err);
      });
  }

  return function sendMessageMqtt(msg, threadID, callback, replyToMessage) {
    if (!ctx.mqttClient || !ctx.mqttClient.connected) {
      return callback({ error: "MQTT client is not connected. Call listenMqtt first." });
    }

    var emojiSizes = { small: 1, medium: 2, large: 3 };
    var threadIDString = threadID.toString();
    var timestamp = Date.now();
    var epoch = timestamp << 22;
    var otid = epoch + Math.floor(Math.random() * 4194304);

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
              text: msg.body != null ? msg.body.toString() : "",
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
        epoch_id: mqttEpochID(),
        version_id: "6120284488008082",
        data_trace_id: null
      },
      request_id: 1,
      type: 3
    };

    if (msg.emoji) {
      var emojiSize = msg.emojiSize || "small";
      form.payload.tasks[0].payload.send_type = 1;
      form.payload.tasks[0].payload.text = msg.emoji;
      form.payload.tasks[0].payload.hot_emoji_size = !isNaN(emojiSize)
        ? emojiSize
        : emojiSizes[emojiSize];
    }

    if (msg.location) {
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

    if (msg.mentions && msg.body) {
      var mentionIds = [];
      var mentionOffsets = [];
      var mentionLengths = [];
      var mentionTypes = [];

      for (var i = 0; i < msg.mentions.length; i++) {
        var mention = msg.mentions[i];
        var tag = mention.tag;
        if (typeof tag !== "string") {
          return callback({ error: "Mention tags must be strings." });
        }

        var offset = msg.body.indexOf(tag, mention.fromIndex || 0);
        if (offset < 0) {
          log.warn("sendMessage", 'Mention for "' + tag + '" not found in message string.');
        }

        mentionIds.push(mention.id || 0);
        mentionOffsets.push(offset);
        mentionLengths.push(tag.length);
        mentionTypes.push("p");
      }

      form.payload.tasks[0].payload.send_type = 1;
      form.payload.tasks[0].payload.mention_data = {
        mention_ids: mentionIds.join(","),
        mention_offsets: mentionOffsets.join(","),
        mention_lengths: mentionLengths.join(","),
        mention_types: mentionTypes.join(",")
      };
    }

    if (msg.sticker) {
      form.payload.tasks[0].payload.send_type = 2;
      form.payload.tasks[0].payload.sticker_id = msg.sticker;
    }

    function publish() {
      if (replyToMessage) {
        form.payload.tasks[0].payload.reply_metadata = {
          reply_source_id: replyToMessage,
          reply_source_type: 1,
          reply_type: 0
        };
      }

      form.payload.tasks.forEach(function (task) {
        task.payload = JSON.stringify(task.payload);
      });
      form.payload = JSON.stringify(form.payload);

      ctx.mqttClient.publish("/ls_req", JSON.stringify(form), {}, function (err, data) {
        if (err) {
          log.error("sendMessageMqtt", err);
          return callback(err);
        }
        callback(null, data);
      });
    }

    if (!msg.attachment) {
      return publish();
    }

    var baseSendTask = form.payload.tasks[0];
    var readTask = form.payload.tasks[1];
    var hasText = !!(baseSendTask.payload.text && String(baseSendTask.payload.text).trim());

    if (hasText) {
      var attachmentTask = {
        label: "46",
        payload: {
          thread_id: threadIDString,
          otid: (otid + 1).toString(),
          source: 0,
          send_type: 3,
          sync_group: 1,
          text: null,
          initiating_source: 1,
          skip_url_preview_gen: 0,
          attachment_fbids: []
        },
        queue_name: threadIDString,
        task_id: 1,
        failure_count: null
      };

      baseSendTask.payload.send_type = 1;
      baseSendTask.task_id = 0;
      readTask.task_id = 2;
      form.payload.tasks = [baseSendTask, attachmentTask, readTask];
    } else {
      baseSendTask.payload.send_type = 3;
      baseSendTask.payload.attachment_fbids = [];
      if (!baseSendTask.payload.text) {
        baseSendTask.payload.text = null;
      }
    }

    if (utils.getType(msg.attachment) !== "Array") {
      msg.attachment = [msg.attachment];
    }

    uploadAttachment(msg.attachment, function (err, files) {
      if (err) {
        return callback(err);
      }

      var attachmentPayload = hasText
        ? form.payload.tasks[1].payload
        : form.payload.tasks[0].payload;

      files.forEach(function (file) {
        var key = Object.keys(file);
        var type = key[0];
        attachmentPayload.attachment_fbids.push(file[type]);
      });
      publish();
    });
  };
};
