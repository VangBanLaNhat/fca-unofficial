"use strict";

var utils = require("../utils");
var log = require("npmlog");
var e2eeThread = require("../e2ee/thread");

module.exports = function(defaultFuncs, api, ctx) {
  function setMessageReactionOverMqtt(reaction, messageID, threadID, callback) {
    if (!ctx.mqttClient) {
      return callback(new Error("Not connected to MQTT"));
    }

    var reqID = ctx.wsReqNumber + 1;
    ctx.wsReqNumber += 1;
    ctx.wsTaskNumber += 1;

    var taskPayload = {
      thread_key: threadID,
      timestamp_ms: Date.now(),
      message_id: messageID,
      reaction: reaction,
      actor_id: ctx.userID,
      reaction_style: null,
      sync_group: 1,
      send_attribution: Math.random() < 0.5 ? 65537 : 524289
    };

    var task = {
      failure_count: null,
      label: "29",
      payload: JSON.stringify(taskPayload),
      queue_name: JSON.stringify(["reaction", messageID]),
      task_id: ctx.wsTaskNumber
    };

    var content = {
      app_id: "2220391788200892",
      payload: JSON.stringify({
        data_trace_id: null,
        epoch_id: parseInt(utils.generateOfflineThreadingID(), 10),
        tasks: [task],
        version_id: "7158486590867448"
      }),
      request_id: ctx.wsReqNumber,
      type: 3
    };

    var mqttClient = ctx.mqttClient;
    var timeout = setTimeout(function () {
      mqttClient.removeListener("message", handleRes);
      callback(new Error("setMessageReactionMqtt response timeout"));
    }, 10000);

    function handleRes(topic, message) {
      if (topic !== "/ls_resp") return;

      var jsonMsg;
      try {
        jsonMsg = JSON.parse(message.toString());
      } catch (_) {
        return;
      }

      if (jsonMsg.request_id !== reqID) return;

      clearTimeout(timeout);
      mqttClient.removeListener("message", handleRes);
      callback(null, jsonMsg);
    }

    mqttClient.on("message", handleRes);
    mqttClient.publish("/ls_req", JSON.stringify(content), { qos: 1, retain: false });
  }

  return function setMessageReaction(reaction, messageID, callback, forceCustomReaction) {
    var resolveFunc = function(){};
    var rejectFunc = function(){};
    var returnPromise = new Promise(function (resolve, reject) {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    var e2eeMeta = null;
    var threadID = null;
    if (utils.getType(messageID) === "Object") {
      e2eeMeta = messageID;
      threadID = messageID.threadID || messageID.threadId || null;
      messageID = messageID.messageID || messageID.messageId || messageID.id;
    }

    if (utils.getType(callback) === "String" || utils.getType(callback) === "Number") {
      threadID = callback.toString();
      callback = null;
    }

    if (utils.getType(callback) === "Object") {
      e2eeMeta = Object.assign({}, e2eeMeta || {}, callback);
      threadID = callback.threadID || callback.threadId || threadID;
      callback = null;
    }

    if (utils.getType(forceCustomReaction) === "String" || utils.getType(forceCustomReaction) === "Number") {
      threadID = forceCustomReaction.toString();
      forceCustomReaction = false;
    }

    if (utils.getType(forceCustomReaction) === "Object") {
      e2eeMeta = Object.assign({}, e2eeMeta || {}, forceCustomReaction);
      threadID = forceCustomReaction.threadID || forceCustomReaction.threadId || threadID;
      forceCustomReaction = !!forceCustomReaction.forceCustomReaction;
    }

    if (!callback) {
      callback = function (err, friendList) {
        if (err) {
          return rejectFunc(err);
        }
        resolveFunc(friendList);
      };
    }

    switch (reaction) {
      case "\uD83D\uDE0D": //:heart_eyes:
      case "\uD83D\uDE06": //:laughing:
      case "\uD83D\uDE2E": //:open_mouth:
      case "\uD83D\uDE22": //:cry:
      case "\uD83D\uDE20": //:angry:
      case "\uD83D\uDC4D": //:thumbsup:
      case "\uD83D\uDC4E": //:thumbsdown:
      case "\u2764": //:heart:
      case "\uD83D\uDC97": //:glowingheart:
      case "":
        //valid
        break;
      case ":heart_eyes:":
      case ":love:":
        reaction = "\uD83D\uDE0D";
        break;
      case ":laughing:":
      case ":haha:":
        reaction = "\uD83D\uDE06";
        break;
      case ":open_mouth:":
      case ":wow:":
        reaction = "\uD83D\uDE2E";
        break;
      case ":cry:":
      case ":sad:":
        reaction = "\uD83D\uDE22";
        break;
      case ":angry:":
        reaction = "\uD83D\uDE20";
        break;
      case ":thumbsup:":
      case ":like:":
        reaction = "\uD83D\uDC4D";
        break;
      case ":thumbsdown:":
      case ":dislike:":
        reaction = "\uD83D\uDC4E";
        break;
      case ":heart:":
        reaction = "\u2764";
        break;
      case ":glowingheart:":
        reaction = "\uD83D\uDC97";
        break;
      default:
        if (forceCustomReaction) {
          break; 
        }
        return callback({ error: "Reaction is not a valid emoji." });
    }

    if (e2eeMeta && e2eeThread.isE2EEChatJid(e2eeMeta.chatJid)) {
      if (!e2eeMeta.senderJid) {
        return callback({ error: "E2EE reaction requires senderJid in message descriptor." });
      }
      api.sendReactionE2EE(e2eeMeta.chatJid, messageID, e2eeMeta.senderJid, reaction, callback);
      return returnPromise;
    }

    if (ctx.mqttClient && threadID && !ctx.globalOptions.pageID) {
      setMessageReactionOverMqtt(reaction, messageID, threadID, callback);
      return returnPromise;
    }

    var variables = {
      data: {
        client_mutation_id: ctx.clientMutationId++,
        actor_id: ctx.userID,
        action: reaction == "" ? "REMOVE_REACTION" : "ADD_REACTION",
        message_id: messageID,
        reaction: reaction
      }
    };

    var qs = {
      doc_id: "1491398900900362",
      variables: JSON.stringify(variables),
      dpr: 1
    };

    defaultFuncs
      .postFormData(
        "https://www.facebook.com/webgraphql/mutation/",
        ctx.jar,
        {},
        qs
      )
      .then(utils.parseAndCheckLogin(ctx.jar, defaultFuncs))
      .then(function(resData) {
        if (!resData) {
          throw { error: "setReaction returned empty object." };
        }
        if (resData.error) {
          throw resData;
        }
        callback(null);
      })
      .catch(function(err) {
        log.error("setReaction", err);
        return callback(err);
      });

    return returnPromise;
  };
};
