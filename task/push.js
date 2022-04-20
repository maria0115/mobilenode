const util = require("../lib/util.js");
const logger = require("../lib/log.js");
const config = require("../config/config.json");
const path = require("path");
const express = require("express");
const router = express.Router();
const axios = require("axios");
var moment = require("moment");
var urlencode = require('urlencode');
// var apn = require('@parse/node-apn');
var apn = require('apn');

const https = require('https');

const agent = new https.Agent({
    rejectUnauthorized: false
});

const admin = require('firebase-admin');
let serAccount = require('../setting/saerom-m60-f5cb8-firebase-adminsdk-nul8j-1f6fd3fc4d.json');
// const { IosApp } = require("firebase-admin/lib/project-management/ios-app");
require('events').EventEmitter.prototype._maxListeners = 100;


admin.initializeApp({
    credential: admin.credential.cert(serAccount),
})

const get = async (config, qObj, res, req) => {
    if (config.customVersion.toLowerCase().indexOf("swg6") != 0) {
        //비표준, 사이트 수정이 필요한 경우 '/task/customise/...js' 를 수정 하십시오
        var functionName = qObj.functionName;
        const site = require("./customize/" + functionName + ".js");
        site.get(config, qObj, res, req); //사이트 커스터마이즈인 경우 별도함수 호출하고 종료
        return;
    }
};
const post = async (config, qObj, res, req) => {
    // 데이터 체크 없으면 return
    if (
        typeof qObj.target == "undefined" ||
        typeof qObj.target == undefined ||
        qObj.target == null ||
        qObj.target == ""
    ) {
        util.writeSuccess({ result: false, desc: "No target!" }, res);
        return;
    } else if (
        typeof qObj.event == "undefined" ||
        typeof qObj.event == undefined ||
        qObj.event == null ||
        qObj.event == ""
    ) {
        util.writeSuccess({ result: false, desc: "No event!" }, res);
        return;
    } else {
        util.writeSuccess({ result: true, desc: "Success!" }, res);
    }

    if (config.customVersion.toLowerCase().indexOf("swg6") != 0) {
        //비표준, 사이트 수정이 필요한 경우 '/task/customise/...js' 를 수정 하십시오
        var functionName = qObj.functionName;
        const site = require("./customize/" + functionName + ".js");
        site.post(config, qObj, res, req); //사이트 커스터마이즈인 경우 별도함수 호출하고 종료
        return;
    }
    //target_token은 푸시 메시지를 받을 디바이스의 토큰값입니다
    var url = `${config.elastic_address[config.version]}/${config.user_push}/_search`;
    const id = config.elastic_id + ":" + config.elastic_pw;
    var authorization = Buffer.from(id, "utf8").toString("base64");
    var query = `{
            "query": {
              "match": {
                "reader": "${urlencode.decode(qObj.target)}"
              }
            }
          }`;

    var data = await axios({
        method: "post",
        url: url,
        httpsAgent: agent,
        data: query,
        headers: {
            Authorization: "Basic " + authorization,
            "Content-Type": "application/json",
        },
    })
        .then((response) => {
            var data = response.data;

            return data["hits"]["hits"];

        })
        .catch((error) => {
            throw new Error(error);
        });
    var isAlarm = true;
    //결재요청 알림
    var phoneOptions = await findOptions(config, qObj, res, req);
    if (qObj.event == "aprv_agree") {
        qObj.url = "/mobile_index/approval_more/approve?data=%7B%22type%22%3A%22approve%22,%22lnbid%22%3A%22W0211%22,%22top%22%3A%22W0010%22,%22title%22%3A%22%EA%B2%B0%EC%9E%AC%ED%95%A0%EB%AC%B8%EC%84%9C%22%7D";
        isAlarm = phoneOptions["alarm"]["approval"];
    }
    //결재완료 알림
    if (qObj.event == "aprv_complete") {
        qObj.url = "/mobile_index/approval_more/success_date?data=%7B%22type%22%3A%22success_date%22,%22lnbid%22%3A%22W0300%22,%22top%22%3A%22W0010%22,%22title%22%3A%22%EC%99%84%EB%A3%8C%ED%95%A8%22%7D"
        isAlarm = phoneOptions["alarm"]["approval"];
    }
    //합의 동의 알림
    if (qObj.event == "aprv_mutual") {
        qObj.url = "/mobile_index/approval_more/ing?data=%7B%22type%22%3A%22approving%22,%22lnbid%22%3A%22W0213%22,%22top%22%3A%22W0010%22,%22title%22%3A%22%EA%B2%B0%EC%9E%AC%EC%A4%91%EB%AC%B8%EC%84%9C%22%7D"
        isAlarm = phoneOptions["alarm"]["approval"];
    }
    //합의 부동의 알림
    if (qObj.event == "aprv_mutual_reject") {
        qObj.url = "/mobile_index/approval_more/ing?data=%7B%22type%22%3A%22approving%22,%22lnbid%22%3A%22W0213%22,%22top%22%3A%22W0010%22,%22title%22%3A%22%EA%B2%B0%EC%9E%AC%EC%A4%91%EB%AC%B8%EC%84%9C%22%7D"
        isAlarm = phoneOptions["alarm"]["approval"];
    }
    //직전반려 알림 메일 
    if (qObj.event == "aprv_prevreject") {
        qObj.url = "/mobile_index/approval_more/reject?data=%7B%22type%22%3A%22reject%22,%22lnbid%22%3A%22W0235%22,%22top%22%3A%22W0010%22,%22title%22%3A%22%EB%B0%98%EB%A0%A4%EB%90%9C%EB%AC%B8%EC%84%9C%22%7D"
        isAlarm = phoneOptions["alarm"]["approval"];
    }
    //부결 알림
    if (qObj.event == "aprv_reject") {
        qObj.url = "/mobile_index/approval_more/reject?data=%7B%22type%22%3A%22reject%22,%22lnbid%22%3A%22W0235%22,%22top%22%3A%22W0010%22,%22title%22%3A%22%EB%B0%98%EB%A0%A4%EB%90%9C%EB%AC%B8%EC%84%9C%22%7D"
        isAlarm = phoneOptions["alarm"]["approval"];
    }
    //문서 수정 알림
    if (qObj.event == "aprv_save") {
        qObj.url = "/mobile_index/approval_more/ing?data=%7B%22type%22%3A%22approving%22,%22lnbid%22%3A%22W0213%22,%22top%22%3A%22W0010%22,%22title%22%3A%22%EA%B2%B0%EC%9E%AC%EC%A4%91%EB%AC%B8%EC%84%9C%22%7D"
        isAlarm = phoneOptions["alarm"]["approval"];
    }
    //메일 수신
    if (qObj.event == "mail_receive") {
        qObj.url = "/mobile_index/mail_more/inbox_detail?"
        isAlarm = phoneOptions["alarm"]["mail"];
    }
    //일정 수신
    // if (qObj.event == "mail_receive") {
    //     qObj.url = `/mobile_index/schedule_more/month?data=%7B"title"%3A"일정","lnbid"%3A"","category"%3A"schedule","type"%3A"","top"%3A""%7D`
    // }
    //사용자 에티켓 설정 시간이면 알람 거부
    if (phoneOptions["etiquette"]["use"] == true && isAlarm == true) {
        var toDay = new Date();
        toDay = moment(toDay).format("HHmm");
        var startTime = phoneOptions["etiquette"]["starttime"];
        startTime = startTime.replace(":", "");
        var endTime = phoneOptions["etiquette"]["endtime"];
        endTime = endTime.replace(":", "");

        if (toDay > startTime && toDay < endTime) {
            isAlarm = false;
        }
    }
    if (isAlarm) {
        for (var i = 0; i < data.length; i++) {
            var target_token = data[i]["_source"]["pushId"];
            // console.log(target_token, "???????????????????????");
            if (data[i]["_source"]["osKind"] === "A") {
                android(res, qObj, target_token);
            } else if (data[i]["_source"]["osKind"] === "I") {
                iPhone(res, qObj, target_token);
            }
        }
        // util.writeSuccess("success", res);
    } else {
        // util.writeSuccess("사용자 설정에의한 알람 거부", res);
    }
};
async function android(res, qObj, target_token) {
    var message = {
        data: {
            title: urlencode.decode(qObj.from),
            body: urlencode.decode(qObj.body),
            url: qObj.url,
        },
        token: target_token,
    }

    await admin
        .messaging()
        .send(message)
        .then(function (response) {
            console.log('안드로이드 알람 성공', qObj.event, " 토큰값: ", target_token);
        })
        .catch(function (err) {
            console.log('안드로이드 알람 실패', target_token, err);
        })
    return;
}
async function iPhone(res, qObj, target_token) {
    var options = {
        token: {
            key: "setting/AuthKey_SC88N9BV69.p8",
            keyId: "SC88N9BV69",
            teamId: "92SNX5S8F3"
        },
        production: true
    };
    var apnProvider = new apn.Provider(options);

    var note = new apn.Notification();

    // note.expiry = Math.floor(Date.now() / 1000) + 3600;
    // note.badge = 3;
    // note.sound = "ping.aiff";
    note.alert = urlencode.decode(`${qObj.from}\n${qObj.body}`);
    note.payload = { from: `${urlencode.decode(qObj.from)}`, url: `${qObj.url}` };
    note.topic = `com.saerom.m60`;

    var tokenArr = [];
    tokenArr.push(target_token);
    await apnProvider.send(note, target_token).then(function (result) {
        console.log("아이폰 알람???", result.failed);
    }).catch(function (err) {
        console.log('아이폰 알람 실패', err)
    });
    return;
}
async function findEmail(config, qObj, res, req) {

    var url = `${config.elastic_address[config.version]}/${config.elasticPersonDB}/_search`;
    const id = config.elastic_id + ":" + config.elastic_pw;
    var authorization = Buffer.from(id, "utf8").toString("base64");
    var query = `{
            "query": {
              "match": {
                "notesId": "${urlencode.decode(qObj.target.toUpperCase())}"
              }
            }
          }`;

    var result = await axios({
        method: "post",
        url: url,
        httpsAgent: agent,
        data: query,
        headers: {
            Authorization: "Basic " + authorization,
            "Content-Type": "application/json",
        },
    })
        .then((response) => {
            var data = response.data;

            return data["hits"]["hits"];

        })
        .catch((error) => {
            throw new Error(error);
        });
    return result[0]["_source"]["email"];
}
async function findOptions(config, qObj, res, req) {
    var email = await findEmail(config, qObj, res, req);

    var url = `${config.elastic_address[config.version]}/${config.default_index.v7}/_search`;
    const id = config.elastic_id + ":" + config.elastic_pw;
    var authorization = Buffer.from(id, "utf8").toString("base64");
    var query = `{
            "query": {
              "match": {
                "_id": "${email}"
              }
            }
          }`;

    var result = await axios({
        method: "post",
        url: url,
        httpsAgent: agent,
        data: query,
        headers: {
            Authorization: "Basic " + authorization,
            "Content-Type": "application/json",
        },
    })
        .then((response) => {
            var data = response.data;

            return data["hits"]["hits"];

        })
        .catch((error) => {
            throw new Error(error);
        });
    return result[0]["_source"];
}
module.exports = { get, post };