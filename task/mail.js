const express = require("express");
const util = require("../lib/util.js");
const common = require("../lib/common.js");
const logger = require("../lib/log.js");
const config = require("../config/config.json");
const path = require("path");
const axios = require("axios");
const cheerio = require('cheerio');
var urlencode = require('urlencode');
var moment = require("moment");
var FormData = require('form-data');
var multer = require('multer');
var isBase64 = require('is-base64');
var upload = multer();
var fs = require('fs');
var utf8 = require('utf8');
var quotedPrintable = require('quoted-printable');
var iconv = require('iconv-lite');
var app = express();
const https = require('https');

const agent = new https.Agent({
    rejectUnauthorized: false
});
const get = async (config, qObj, res, req) => {
    if (config.customVersion.toLowerCase().indexOf("swg6") != 0) {
        //비표준, 사이트 수정이 필요한 경우 '/task/customise/...js' 를 수정 하십시오
        var functionName = qObj.functionName;
        const site = require("./customize/" + functionName + ".js");
        site.get(config, qObj, res, req); //사이트 커스터마이즈인 경우 별도함수 호출하고 종료
        return;
    }
    //여기 부터 표준 api 코드 작성
    //다국어 ko인지 en인지
    var languageArr = qObj.cookie.split(";");
    var language = "";
    for (i = 0; i < languageArr.length; i++) {
        if (languageArr[i].indexOf("language") > -1) {
            var find = languageArr[i].split("=")
            language = find[1];
        }
    }
    qObj.language = language;
    //console.log(language);
    //사용자 사번 찾기
    var readerArr = qObj.readers.split("/"); //[ 'CN=박광순', 'OU=209003', 'O=SIS' ]
    for (var readerInx = 0; readerInx < readerArr.length; readerInx++) {
        if (readerArr[readerInx].indexOf("OU=") > -1) {
            var sabun = util.strRight(readerArr[readerInx], 'OU='); //209003
            qObj.sabun = sabun;
        }
    }

    //사용자 메일DB 찾기
    var mailPath = await common.getMailPath(qObj);
    //console.log("***************", mailPath);
    qObj.mailPath = mailPath;

    var url = "";
    //var setUrl = "";
    var count, page = 0;

    count = qObj.size;
    if (count == undefined || count == "undefined" || count == null || count == "") {
        count = 1000;
        qObj.size = count;
    } else {
        count *= 1;
        qObj.size = count;
    }

    page = qObj.page;
    if (page == undefined || page == "undefined" || page == null || page == "") {
        page = 0;
        qObj.page = page;
    } else {
        page *= 1;
        qObj.page = page;
    }

    var start = 0;

    if (page == 0) {
        start = 1;
    } else if (page == 0) {
        start = 0;
    }

    if (qObj.type === "inbox_detail" | qObj.type === "mail_inner" | qObj.type === "mail_outer" | qObj.type === "mail_notice" | qObj.type === "mail_attach" | qObj.type === "sent_detail" | qObj.type === "mail_draft" | qObj.type === "mail_autoSave" | qObj.type === "mail_trash" | qObj.type === "mail_my" | qObj.type === "mail_importance" || qObj.type === "sent_main") {
        url = config.host + config.mail.inboxAddr;
        start = page * count + 1;
    } else if (qObj.type === "inbox_main") {
        url = config.host + config.mail.inbox_main;
        start = page * count;
    }
    // else if (qObj.type === "sent_main") {
    //     url = config.host + config.mail.sent_main;
    //     start = page * count;
    // } 
    else if (qObj.type === "mail_unread") {
        url = config.host + config.mail.unread;
        start = page * count + 1;
    } else if (qObj.type === "mail_followup") {
        url = config.host + config.mail.followup;
        start = page * count + 1;
    } else if (qObj.type == "custom") {
        url = config.host + config.mail.custom;
        start = page * count + 1;
        url = url.replace(/#FolderId#/, qObj.FolderId);
    } else if (qObj.type == "signature") {
        url = config.host + config.mail.setting.signature;
        start = page * count + 1;
    } else if (qObj.type == "greetings") {
        url = config.host + config.mail.setting.greetings;
        start = page * count + 1;
    } else if (qObj.type == "search") {
        url = config.host + config.mail.search;
        qObj.start = page * count + 1;
        start = page * count + 1;
    }

    url = url.replace(/#path#/, qObj.mailPath);
    url = url.replace(/#count#/, qObj.size);
    url = url.replace(/#start#/, start);
    //console.log(qObj, "**qObj**");
    //받은메일 상세
    if (qObj.type === "inbox_detail") {
        //받은 메일(목록)
        qObj.viewName = "($Inbox)";
        qObj.viewName2 = "($webinbox)";
        qObj.resortdescending = "5";
        url = url.replace(/#viewName#/, qObj.viewName);
        url = url.replace(/#resortdescending#/, qObj.resortdescending);
        console.log(url);
        await getMailDetail(qObj, res, req, url);

    }
    //보낸메일 상세
    else if (qObj.type === "sent_detail") {
        //보낸 메일(목록)
        qObj.viewName = "($websent)";
        qObj.viewName2 = "($websent)";
        qObj.resortdescending = "6";
        url = url.replace(/#viewName#/, qObj.viewName);
        url = url.replace(/#resortdescending#/, qObj.resortdescending);
        console.log(url);
        await getMailDetail(qObj, res, req, url);
    }
    //받은메일
    else if (qObj.type === "inbox_main") {
        console.log(url);
        //받은 메일(메인)
        axios({
            method: "get",
            url: url,
            httpsAgent: agent,
            headers: {
                "Content-Type": "application/json",
                "Cookie": qObj.cookie
            },
        })
            .then((response) => {
                console.log("****************받은 메일(메인)*******************");
                var data = response.data;
                // console.log(data);
                var obj = {};
                var string = '';
                var result2 = '';

                for (var a = 0; a < data.length; a++) {
                    var dockey = '';
                    dockey = util.strRight(data[a].href, "/");
                    dockey = util.strLeftBack(dockey, "/api/");
                    obj.unid = util.strRightBack(data[a].href, "/messages/");
                    obj.dockey = dockey;
                    obj.created = moment(data[a].date).utc().format("YYYYMMDDTHHmmss");
                    obj.subject = data[a].subject;
                    obj.from = data[a].from.displayName;
                    if (data[a].read) {
                        obj.unread = false;
                    } else if (!data[a].read) {
                        obj.unread = true;
                    }
                    if (a == (data.length - 1)) {
                        string += JSON.stringify(obj);
                    } else {
                        string += JSON.stringify(obj) + ",\n";
                    }
                }
                result2 = "[" + string + "]";

                util.writeSuccess(JSON.parse(result2), res);
                return;
            })
            .catch((error) => {
                throw new Error(error);
            });
    }
    //보낸메일
    else if (qObj.type === "sent_main") {
        qObj.viewName = "($websent)";
        qObj.viewName2 = "($webinbox)";
        qObj.resortdescending = "6";
        url = url.replace(/#viewName#/, qObj.viewName);
        url = url.replace(/#resortdescending#/, qObj.resortdescending);
        console.log(url);
        await getMailDetail(qObj, res, req, url);
        // console.log(url);

        // //보낸 메일(메인)
        // axios({
        //     method: "get",
        //     url: url,
        //     httpsAgent: agent,
        //     headers: {
        //         "Content-Type": "application/json",
        //         "Cookie": qObj.cookie
        //     },
        // })
        //     .then((response) => {
        //         console.log("****************받은 메일(메인)*******************");
        //         var data = response.data;
        //         var obj = {};
        //         var string = '';
        //         var result2 = '';
        //         for (var a = 0; a < data.length; a++) {
        //             var dockey = '';
        //             dockey = util.strRight(data[a].href, "/");
        //             dockey = util.strLeftBack(dockey, "/api/");
        //             obj.unid = util.strRightBack(data[a].href, "/messages/");
        //             obj.dockey = dockey;
        //             obj.created = moment(data[a].date).utc().format("YYYYMMDDTHHmmss");
        //             obj.subject = data[a].subject;
        //             obj.from = data[a].to.displayName;
        //             if (data[a].read) {
        //                 obj.unread = false;
        //             } else if (!data[a].read) {
        //                 obj.unread = true;
        //             }
        //             if (a == (data.length - 1)) {
        //                 string += JSON.stringify(obj);
        //             } else {
        //                 string += JSON.stringify(obj) + ",\n";
        //             }
        //         }
        //         result2 = "[" + string + "]";

        //         util.writeSuccess(JSON.parse(result2), res);
        //         return;
        //     })
        //     .catch((error) => {
        //         throw new Error(error);
        //     });
    }
    //폴더 목록
    else if (qObj.type === "folderList") {
        var url = config.host + config.mail.folderList;
        url = url.replace("#path#", qObj.mailPath);
        console.log(url);
        var result = await axios({
            method: 'get',
            url: url,
            httpsAgent: agent,
            headers: {
                "Cookie": qObj.cookie,
                'Content-Type': 'application/json'
            }
        }).then((response) => {
            var data = response.data;
            return data;
        })
        var resArr = await tree(result);
        // console.log("top1",top1,"top1");
        util.writeSuccess(resArr, res);
    }
    //안읽은메일
    else if (qObj.type === "mail_unread") {
        // qObj.viewName = "($Inbox)";
        // qObj.resortdescending = "5";
        // url = url.replace(/#viewName#/, qObj.viewName);
        // url = url.replace(/#resortdescending#/, qObj.resortdescending);
        // url = url.replace(/#count#/, "991");
        var url = config.host + config.mail.unreadAll;
        url = url.replace(/#path#/, qObj.mailPath);
        console.log(url, "?????????");
        unreadList(qObj, res, req, url);
        // await getMailDetail(qObj, res, req, url);
    }
    //내부메일
    else if (qObj.type === "mail_inner") {
        qObj.viewName = "($webinbox)_inner";
        qObj.viewName2 = "($webinbox)_inner";
        qObj.resortdescending = "7";
        url = url.replace(/#viewName#/, qObj.viewName);
        url = url.replace(/#resortdescending#/, qObj.resortdescending);
        console.log(url);
        await getMailDetail(qObj, res, req, url);
    }
    //외부메일
    else if (qObj.type === "mail_outer") {
        qObj.viewName = "($webinbox)_outer";
        qObj.viewName2 = "($webinbox)_outer";
        qObj.resortdescending = "7";
        url = url.replace(/#viewName#/, qObj.viewName);
        url = url.replace(/#resortdescending#/, qObj.resortdescending);
        console.log(url);
        await getMailDetail(qObj, res, req, url);
    }
    //알림메일
    else if (qObj.type === "mail_notice") {
        qObj.viewName = "($webNotice)";
        qObj.viewName2 = "($webNotice)";
        qObj.resortdescending = "6";
        url = url.replace(/#viewName#/, qObj.viewName);
        url = url.replace(/#resortdescending#/, qObj.resortdescending);
        console.log(url);
        await getMailDetail(qObj, res, req, url);
    }
    //첨부메일
    else if (qObj.type === "mail_attach") {
        qObj.viewName = "($webattachments)";
        qObj.viewName2 = "($webattachments)";
        qObj.resortdescending = "6";
        url = url.replace(/#viewName#/, qObj.viewName);
        url = url.replace(/#resortdescending#/, qObj.resortdescending);
        console.log(url);
        await getMailDetail(qObj, res, req, url);
    }
    //임시저장 메일
    else if (qObj.type === "mail_draft") {
        qObj.viewName = "($webdrafts)";
        qObj.viewName2 = "($webdrafts)";
        qObj.resortdescending = "4";
        url = url.replace(/#viewName#/, qObj.viewName);
        url = url.replace(/#resortdescending#/, qObj.resortdescending);
        console.log(url);
        await getMailDetail(qObj, res, req, url);
    }
    //자동저장 메일
    else if (qObj.type === "mail_autoSave") {
        qObj.viewName = "AutoSave4Mail";
        qObj.viewName2 = "AutoSave4Mail";
        qObj.resortdescending = "4";
        url = url.replace(/#viewName#/, qObj.viewName);
        url = url.replace(/#resortdescending#/, qObj.resortdescending);
        console.log(url);
        await getMailDetail(qObj, res, req, url);
    }
    //휴지통
    else if (qObj.type === "mail_trash") {
        qObj.viewName = "($webtrash)";
        qObj.viewName2 = "($webtrash)";
        qObj.resortdescending = "6";
        url = url.replace(/#viewName#/, qObj.viewName);
        url = url.replace(/#resortdescending#/, qObj.resortdescending);
        console.log(url);
        await getMailDetail(qObj, res, req, url);
    }
    //예약메일
    else if (qObj.type === "mail_reservation") {
        url = config.host + config.mail.reservation;
        start = page * count + 1;
        url = url.replace(/#count#/, qObj.size);
        url = url.replace(/#start#/, start);
        url = url.replace(/#sabun#/, qObj.sabun);
        console.log(url);

        var data = await axios({
            method: "get",
            url: url,
            httpsAgent: agent,
            headers: {
                "Content-Type": "application/json",
                "Cookie": qObj.cookie
            },
        })
            .then((response) => {
                console.log("****************받은 메일*****detail************");
                // console.log(response.data);
                return response.data;
            })
            .catch((error) => {
                throw new Error(error);
            });
        // console.log(data.viewentry);

        if (data.viewentry == null | data.viewentry == "" | data.viewentry == undefined | data.viewentry == [] | data.viewentry == "undefined") {
            data.viewentry = {};
            util.writeSuccess(data.viewentry, res);
            return;
        }
        var resObj = {};
        var resArr = [];
        for (var i = 0; i < data.viewentry.length; i++) {
            var obj = {};
            obj.unid = data.viewentry[i]['@unid'];
            if (data.viewentry[i].entrydata[2]['text']['0'] == '<SPAN><img src="/gw_resource/images/i_hotmail.gif" border=0>  </SPAN>') {
                obj.importance = true;
            } else {
                obj.importance = false;
            }
            obj.subject = data.viewentry[i].entrydata[3]['text']['0'];
            obj.subject = util.strRight(obj.subject, 'title="');
            obj.subject = util.strLeft(obj.subject, '">');
            if (data.viewentry[i].entrydata[4]['text']['0'] == '') {
                obj.attach = false;
            } else {
                obj.attach = true;
            }
            obj.receiver = data.viewentry[i].entrydata[5]['text']['0'];
            obj.receiver = util.strLeft(obj.receiver, '</SPAN>');
            obj.receiver = util.strRight(obj.receiver, '>');

            obj.reservation_date = moment(data.viewentry[i].entrydata[6]['datetime']['0']).utc().format("YYYYMMDDTHHmmss");
            resArr[i] = obj;
        }
        resObj.data = resArr;
        resObj.total = data.viewentry[0]['@siblings'];

        util.writeSuccess(resObj, res);
    }
    //내게 쓴 메일
    else if (qObj.type === "mail_my") {
        url = config.host + config.mail.inboxAddr;
        start = page * count + 1;
        qObj.viewName = "($webToMe)";
        qObj.viewName2 = "($webToMe)";
        qObj.resortdescending = "4";
        url = url.replace(/#path#/, qObj.mailPath);
        url = url.replace(/#viewName#/, qObj.viewName);
        url = url.replace(/#resortdescending#/, qObj.resortdescending);
        url = url.replace(/#count#/, qObj.size);
        url = url.replace(/#start#/, start);
        console.log(url);

        var data = await axios({
            method: "get",
            url: url,
            httpsAgent: agent,
            headers: {
                "Content-Type": "application/json",
                "Cookie": qObj.cookie
            },
        })
            .then((response) => {
                console.log("****************받은 메일*****detail************");
                // console.log(response.data);
                return response.data;
            })
            .catch((error) => {
                throw new Error(error);
            });

        var jsonString = util.strRight(data, "<readviewentries>");
        jsonString = util.strLeftBack(jsonString, "<unreadinfo>");
        var result = ""
        result = JSON.parse(jsonString);
        if (result.viewentry == null | result.viewentry == "" | result.viewentry == undefined | result.viewentry == [] | result.viewentry == "undefined") {
            result.viewentry = {};
            util.writeSuccess(result.viewentry, res);
            return;
        }
        var resObj = {};
        var resArr = [];
        for (var i = 0; i < result.viewentry.length; i++) {
            // console.log(result.viewentry[i].entrydata);
            var obj = {};
            obj.unid = result.viewentry[i]['@unid'];
            obj.subject = result.viewentry[i].entrydata[2]['text']['0'];
            obj.subject = util.strRight(obj.subject, '<span title="');
            obj.subject = util.strLeft(obj.subject, '" infoST=');
            obj.attach = result.viewentry[i].entrydata[3]['text']['0'];
            if (obj.attach == '') {
                obj.attach = false;
            } else {
                obj.attach = true;
            }
            obj.created = moment(result.viewentry[i].entrydata[4]['datetime']['0']).utc().format("YYYYMMDDTHHmmss");
            resArr[i] = obj;
        }
        resObj.data = resArr;
        resObj.total = result.viewentry[0]['@siblings'];

        util.writeSuccess(resObj, res);
    }
    //중요메일
    else if (qObj.type === "mail_importance") {
        qObj.viewName = "($webimportance)";
        qObj.viewName2 = "($webimportance)";
        qObj.resortdescending = "6";
        url = url.replace(/#viewName#/, qObj.viewName);
        url = url.replace(/#resortdescending#/, qObj.resortdescending);
        console.log(url);
        await getMailDetail(qObj, res, req, url);
    }
    //followup 메일
    else if (qObj.type === "mail_followup") {
        console.log(url);
        var result = await axios({
            method: "get",
            url: url,
            httpsAgent: agent,
            headers: {
                "Content-Type": "application/json",
                "Cookie": qObj.cookie
            },
        })
            .then((response) => {
                console.log("****************mail_followup************");
                // console.log(response.data);
                return response.data;
            })
            .catch((error) => {
                throw new Error(error);
            });

        var obj = {};
        var string = '';
        var result2 = '';

        if (result.viewentry == null | result.viewentry == "" | result.viewentry == undefined | result.viewentry == [] | result.viewentry == "undefined") {
            result.viewentry = {};
            util.writeSuccess(result.viewentry, res);
            return;
        }

        for (var a = 0; a < result.viewentry.length; a++) {
            // console.log(result.viewentry[a].entrydata);
            obj.unid = result.viewentry[a]['@unid'];
            obj.dockey = qObj.mailPath;
            obj.unread = result.viewentry[a]['@unread'];
            if (obj.unread == 'true') {
                obj.unread = true;
            } else if (obj.unread == 'false') {
                obj.unread = false;
            }
            if (obj.unread == undefined || obj.unread == 'undefined' || obj.unread == '' || obj.unread == null) {
                obj.unread = false;
            }
            obj.author = result.viewentry[a].entrydata[4].text['0'];
            obj.subject = result.viewentry[a].entrydata[6].text['0'];
            obj.attach = result.viewentry[a].entrydata[8].number['0'];
            if (obj.attach == "9999") {
                obj.attach = false;
            } else if (obj.attach == "5") {
                obj.attach = true;
            }
            obj.created = moment(result.viewentry[a].entrydata[7].datetime['0']).utc().format("YYYYMMDDTHHmmss");
            obj.importance = result.viewentry[a].entrydata[1].number['0'];
            if (obj.importance == "204") {
                obj.importance = true;
            } else {
                obj.importance = false;
            }

            obj.followupText = result.viewentry[a].entrydata[9].text['0'];


            if (a == (result.viewentry.length - 1)) {
                string += JSON.stringify(obj);
            } else {
                string += JSON.stringify(obj) + ",\n";
            }
        }
        result2 = "[" + string + "]";
        var resObj = {};
        resObj.data = JSON.parse(result2);
        resObj.total = result.viewentry[0]['@siblings'];
        util.writeSuccess(resObj, res);

    }
    //메일 상세보기(열람함)
    else if (qObj.type === "detail") {
        // var url = config.host + config.mail.dasDetail;
        var url = config.host + config.mail.getDetail;
        url = url.replace("#path#", qObj.mailPath);
        url = url.replace("#unid#", qObj.unid);
        url = url.replace("#folderName#", "0");
        // url = url.replace("#viewName#", "($Inbox)");
        getDetail(qObj, res, req, url);
    }
    //폴더안에 리스트 가져오기
    else if (qObj.type === "custom") {
        console.log(url);

        referUrl = util.strLeft(url, ".nsf", true);
        axios({
            method: "get",
            url: referUrl,
            httpsAgent: agent,
            headers: {
                "Content-Type": "application/json",
                "Cookie": qObj.cookie
            },
        })
            .then((response) => {
                console.log("****************잠깐 갔다옴************");
                return null;
            })
            .catch((error) => {
                throw new Error(error);
            });
        //////////////////////////////////////////////////////////////////////////////////////
        var data = await axios({
            method: "get",
            url: url,
            httpsAgent: agent,
            headers: {
                "Content-Type": "application/json",
                "Cookie": qObj.cookie
            },
        })
            .then((response) => {
                console.log("****************custom************");
                // console.log(response.data);
                return response.data;
            })
            .catch((error) => {
                throw new Error(error);
            });
        var jsonString = util.strRight(data, "<readviewentries>");
        jsonString = util.strLeftBack(jsonString, "<unreadinfo>");
        result = JSON.parse(jsonString);
        // console.log(result);
        if (result.viewentry == null | result.viewentry == "" | result.viewentry == undefined | result.viewentry == [] | result.viewentry == "undefined") {
            result.viewentry = {};
            util.writeSuccess(result.viewentry, res);
            return;
        }
        var obj = {};
        var string = '';
        var result2 = '';
        for (var a = 0; a < result.viewentry.length; a++) {
            obj.unid = result.viewentry[a]['@unid'];
            obj.dockey = qObj.mailPath;
            obj.unread = result.viewentry[a]['@unread'];
            if (obj.unread == 'true') {
                obj.unread = true;
            } else if (obj.unread == 'false') {
                obj.unread = false;
            }
            if (obj.unread == undefined || obj.unread == 'undefined' || obj.unread == '' || obj.unread == null) {
                obj.unread = false;
            }
            if (qObj.type == "mail_attach" | qObj.type === "sent_detail" | qObj.type === "mail_trash" | qObj.type === "mail_importance") {
                var subject = result.viewentry[a].entrydata[4].text['0'];
                subject = util.strRight(subject, '<span title="');
                subject = util.strLeft(subject, '" infoST=');
                obj.subject = subject;
            } else if (qObj.type == "mail_draft" | qObj.type == "mail_autoSave") {
                var subject = result.viewentry[a].entrydata[2].text['0'];
                subject = util.strRight(subject, 'infoBC=""">');
                subject = util.strLeft(subject, '</span>');
                obj.subject = subject;
            } else {
                obj.subject = result.viewentry[a].entrydata[4].text['0'];
            }

            // obj.importance = result.viewentry[a].entrydata[1].number['0'];
            /////////////////////////////////////////////////////////////////
            obj.attach = result.viewentry[a].entrydata[8].number['0'];
            if (obj.attach == "9999") {
                obj.attach = false;
            } else if (obj.attach == "5") {
                obj.attach = true;
            } else if (obj.attach == "0") {
                if (result.viewentry[a].entrydata[7].number['0'] == '9999') {
                    obj.attach = false;
                } else {
                    obj.attach = true;
                }
            }

            obj.created = moment(result.viewentry[a].entrydata[5].datetime['0']).utc().format("YYYYMMDDTHHmmss");

            obj.importance = result.viewentry[a].entrydata[1].number['0'];
            if (obj.importance == "204") {
                obj.importance = true;
            } else {
                obj.importance = false;
            }

            try {
                obj.followup = result.viewentry[a].entrydata[9].number['0'];
                if (obj.followup == "182") {
                    obj.followup = true;
                } else {
                    obj.followup = false;
                }
            } catch (e) {
                if (result.viewentry[a].entrydata[8].number['0'] == "182") {
                    obj.followup = true;
                } else {
                    obj.followup = false;
                }
            }

            obj.sender = result.viewentry[a].entrydata[3].text['0'];

            let isToStuff = false;
            for (let b = 1; b < result.viewentry[a].entrydata.length; b++) {
                if (result.viewentry[a].entrydata[b]['@name'] == '$ToStuff') {
                    isToStuff = true;
                };
            };
            if (isToStuff) {
                if (result.viewentry[a].entrydata[7].text) {
                    obj.tostuff = { "receive": false, "ref": false };
                } else if (result.viewentry[a].entrydata[7].number['0'] == "184") {
                    obj.tostuff = { "receive": true, "ref": false };
                } else {
                    obj.tostuff = { "receive": false, "ref": false };
                }
            } else {
                obj.tostuff = { "receive": false, "ref": false };
            }
            ////////////////////////////////////////////////////////
            if (a == (result.viewentry.length - 1)) {
                string += JSON.stringify(obj);
            } else {
                string += JSON.stringify(obj) + ",\n";
            }
        }
        result2 = "[" + string + "]";
        var resObj = {};
        resObj.data = JSON.parse(result2);
        resObj.total = result.viewentry[0]['@siblings'];
        util.writeSuccess(resObj, res);
    }
    //읽음표시
    else if (qObj.type === "readflag") {
        console.log("*******************readflag************************");
        // console.log(qObj);
        url = config.host + config.mail.readflag;
        url = url.replace(/#path#/, qObj.mailPath);
        url = url.replace(/#unid#/, qObj.unid);
        console.log(url);
        axios({
            method: "get",
            url: url,
            httpsAgent: agent,
            headers: {
                "Content-Type": "application/json",
                "Cookie": qObj.cookie
            },
        })
            .then((response) => {
                if (response.status == 200) {
                    util.writeSuccess("done", res);
                    return;
                }
            })
            .catch((error) => {
                throw new Error(error);
            });
    }
    //서명, 인사말 리스트
    else if (qObj.type === "signature" || qObj.type === "greetings") {
        console.log("*******************signature, greetings************************");
        console.log(url);
        qObj.url = url;
        var result = await getGreetingsSignature(qObj);
        util.writeSuccess(result, res);

        // var result = await axios({
        //     method: "get",
        //     url: url,
        //     headers: {
        //         "Content-Type": "application/json",
        //         "Cookie": qObj.cookie
        //     },
        // })
        //     .then((response) => {
        //         return response.data;
        //     })
        //     .catch((error) => {
        //         throw new Error(error);
        //     });
        // if (result.viewentry == null | result.viewentry == "" | result.viewentry == undefined | result.viewentry == [] | result.viewentry == "undefined") {
        //     result.viewentry = {};
        //     util.writeSuccess(result.viewentry, res);
        //     return;
        // }
        // var resArr = [];
        // var use = false;
        // for (var i = 0; i < result.viewentry.length; i++) {
        //     var resObj = {};
        //     resObj.unid = result.viewentry[i]['@unid'];
        //     if (result.viewentry[i].entrydata[1].text['0'].indexOf('vwicn114.gif') > -1) {
        //         resObj.default = true;
        //         use = true;
        //     } else {
        //         resObj.default = false;
        //     }
        //     resObj.subject = result.viewentry[i].entrydata[2].text['0'];
        //     resArr[i] = resObj;
        // }
        // var r = {};
        // r.data = resArr;
        // r.use = use;
    }
    //서명, 인사말 설정
    else if (qObj.type === "signatureSet" || qObj.type === "greetingsSet") {
        console.log("*******************Set************************");
        // console.log(qObj);
        if (qObj.type === "signatureSet") {
            url = config.host + config.mail.setting.signatureSet;
        } else if (qObj.type === "greetingsSet") {
            url = config.host + config.mail.setting.greetingsSet;
        }
        url = url.replace(/#path#/, qObj.mailPath);
        url = url.replace(/#unid#/, qObj.unid);
        console.log(url);
        var result = await axios({
            method: "get",
            url: url,
            httpsAgent: agent,
            headers: {
                "Content-Type": "application/json",
                "Cookie": qObj.cookie
            },
        })
            .then((response) => {
                return response.data;
            })
            .catch((error) => {
                throw new Error(error);
            });
        util.writeSuccess(result, res);
    }
    //서명, 인사말 상세보기(열람함)
    else if (qObj.type === "signature_detail" || qObj.type === "greetings_detail") {
        console.log("*******************detail************************");
        var url = config.host + config.mail.setting.detail;
        url = url.replace(/#unid#/, qObj.unid);
        url = url.replace(/#mailpath#/, qObj.mailPath);
        console.log(url);
        var result = await axios({
            method: "get",
            url: url,
            httpsAgent: agent,
            headers: {
                "Content-Type": "application/json",
                "Cookie": qObj.cookie
            },
        })
            .then((response) => {
                return response.data;
            })
            .catch((error) => {
                throw new Error(error);
            });
        var resultObj = {};
        resultObj.unid = result["@unid"];
        resultObj.subject = result.Subject;
        resultObj.created = result.createdDate;
        resultObj.modified = result.modifiedDate;
        if (result.UseDefault == "1") {
            resultObj.default = true;
        } else if (result.UseDefault == undefined) {
            resultObj.default = false;
        } else {
            resultObj.default = false;
        }
        try {
            var body = "";
            for (var bodyinx = 0; bodyinx < result.Body["content"].length; bodyinx++) {
                if (result.Body["content"][bodyinx].contentType.indexOf("text/html") > -1 && result.Body["content"][bodyinx].contentType.indexOf("utf-8") > -1) {
                    body = result.Body["content"][bodyinx].data;
                }
            }
            body = Buffer.from(body, "base64").toString('utf8');

        } catch (e) {
            body = "";
        }
        resultObj.body = body;

        util.writeSuccess(resultObj, res);
    }
    //메일검색
    else if (qObj.type === "search") {
        await getMailSearch(qObj, res, req, url);
    }
    //사용안함
    else if (qObj.type === "email_block") {
        var url = config.host + config.mail.setting.autoSave;
        url = url.replace("#mailpath#", qObj.mailPath);
        var result = await axios({
            method: "get",
            url: url,
            httpsAgent: agent,
            headers: {
                "Content-Type": "application/json",
                "Cookie": qObj.cookie
            },
        })
            .then((response) => {
                util.writeSuccess(response.data, res);
                return;
            })
            .catch((error) => {
                throw new Error(error);
            });
    }
    //자동저장
    else if (qObj.type === "autoSave") {
        var url = config.host + config.mail.setting.autoSave;
        url = url.replace("#mailpath#", qObj.mailPath);
        console.log(url);
        var result = await axios({
            method: "get",
            url: url,
            httpsAgent: agent,
            headers: {
                "Content-Type": "application/json",
                "Cookie": qObj.cookie
            },
        })
            .then((response) => {
                return response.data;
            })
            .catch((error) => {
                throw new Error(error);
            });
        const $ = cheerio.load(result);
        var use = $('body > form > div > div.dwp-page-body.view > div > div > table > tbody:nth-child(2) > tr:nth-child(1) > td :checked').val();
        var saveTime = $('body > form > div > div.dwp-page-body.view > div > div > table > tbody:nth-child(2) > tr:nth-child(2) > td > span > select option:selected').val();
        var saveDay = $('body > form > div > div.dwp-page-body.view > div > div > table > tbody:nth-child(2) > tr:nth-child(3) > td > span > select option:selected').val();
        if (use == undefined || use == "undefined" || use == null || use == "") {
            use = "N"
        }
        if (saveTime == undefined || saveTime == "undefined" || saveTime == null || saveTime == "") {
            saveTime = "10"
        }
        if (saveDay == undefined || saveDay == "undefined" || saveDay == null || saveDay == "") {
            saveDay = "5"
        }

        if (use == "Y") {
            use = true;
        } else {
            use = false;
        }

        var resultObj = {};
        resultObj.use = use;
        resultObj.time = saveTime;
        resultObj.day = saveDay;

        util.writeSuccess(resultObj, res);

    }
    //지연발송
    else if (qObj.type === "delay") {
        var url = config.host + config.mail.setting.delay;
        url = url.replace("#mailpath#", qObj.mailPath);
        var result = await axios({
            method: "get",
            url: url,
            httpsAgent: agent,
            headers: {
                "Content-Type": "application/json",
                "Cookie": qObj.cookie
            },
        })
            .then((response) => {
                return response.data;
            })
            .catch((error) => {
                throw new Error(error);
            });
        const $ = cheerio.load(result);

        var use = $('body > form > div > div.dwp-page-body.view > div > div > table > tbody:nth-child(2) > tr > td :checked').val();
        var delayTime = $('#fw_condition > tr > td > span.sel-wrap > select option:selected').val();

        if (use == undefined || use == "undefined" || use == null || use == "") {
            use = "N"
        }
        if (delayTime == undefined || delayTime == "undefined" || delayTime == null || delayTime == "") {
            delayTime = "5"
        }

        if (use === "Y") {
            use = true;
        } else {
            use = false;
        }
        var resultObj = {};
        resultObj.use = use;
        resultObj.time = delayTime;

        util.writeSuccess(resultObj, res);
    }
    //조직도
    else if (qObj.type === "org") {
        var url = config.host + config.mail.org;
        // console.log(qObj);
        var result = await axios({
            method: "get",
            url: url,
            httpsAgent: agent,
            headers: {
                "Content-Type": "application/json",
                "Cookie": qObj.cookie
            },
        })
            .then((response) => {
                return response.data;
            })
            .catch((error) => {
                throw new Error(error);
            });
        var orgArr = [];
        for (orgInx = 0; orgInx < result.length; orgInx++) {
            var orgObj = {};
            var orgInfo = JSON.parse(result[orgInx]["_jsoninfo"]);
            // console.log(orgInfo);
            var nameArr = orgInfo.orgname.split(",");
            if (qObj.language == "ko") {
                for (var langInx = 0; langInx < nameArr.length; langInx++) {
                    if (nameArr[langInx].indexOf("ko:") > -1) {
                        orgObj.name = util.strRight(nameArr[langInx], ":");
                    }
                }
            } else if (qObj.language == "en") {
                for (var langInx = 0; langInx < nameArr.length; langInx++) {
                    if (nameArr[langInx].indexOf("en:") > -1) {
                        orgObj.name = util.strRight(nameArr[langInx], ":");
                    }
                }
            } else {
                orgObj.name = orgInfo.orgname;
            }
            orgObj.companycode = orgInfo.comcode;
            orgObj.mycode = orgInfo.orgcode;
            orgObj.kinds = result[orgInx]["@form"];
            orgArr[orgInx] = orgObj;
        }
        util.writeSuccess(orgArr, res);
    }
    //조직도 검색
    else if (qObj.type === "orgSearch") {
        var url = `${config.elastic_address[config.version]}/${config.elasticPersonDB}/_search`;

        const id = config.elastic_id + ":" + config.elastic_pw;
        var authorization = Buffer.from(id, "utf8").toString("base64");

        console.log(url);
        var query = `{
            "query": {
                "bool": {
                    "filter": [
                        {
                            "bool": {
                              "must": [
                                    {"term": {"companycode": "${qObj.companycode}"}},
                                    {"term": {"departmentcode": "${qObj.departmentcode}"}}
                                ],
                                "should": [
                                    {"term": {"@form": "Person"}},
                                    {"term": {"@form": "Department"}}
                                ]
                            }
                        }
                    ]
                }
            },
            "size": 100000,
            "from": 0,
            "sort": [
                {"sort": {"order": "asc"}}
            ]
        }`;
        var result = await axios({
            method: "post",
            url: url,
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
        var orgArr = [];
        // console.log(result);
        //퇴사자 지우기 (엘라스틱에는 퇴사자 data 남아있음)
        for (var i = 0; i < result.length; i++) {
            if (result[i]["_source"]["@retired"] === 'Y') {
                result.splice(i, 1);
                i--;
            }
        }
        for (var orgInx = 0; orgInx < result.length; orgInx++) {
            var orgObj = {};
            if (result[orgInx]["_source"]["@form"] == "Person") {
                orgObj.id = result[orgInx]["_source"]["@id"];
                var idArr = orgObj.id.split("/");
                if (idArr.length == 3) {
                    orgObj.scheduleId = orgObj.id + "@" + idArr[2];
                } else if (idArr.length == 2) {
                    orgObj.scheduleId = orgObj.id + "@" + idArr[1];
                }
                orgObj.name = result[orgInx]["_source"]["name"][qObj.language] + " " + result[orgInx]["_source"]["position"][qObj.language];
                orgObj.shortname = result[orgInx]["_source"]["name"][qObj.language];
                orgObj.department = result[orgInx]["_source"]["departmentname"][qObj.language];
                orgObj.company = result[orgInx]["_source"]["companyname"][qObj.language];
                orgObj.email = result[orgInx]["_source"]["email"];
                orgObj.mobile = result[orgInx]["_source"]["mobile"];
                orgObj.office = result[orgInx]["_source"]["office"];
            } else {
                orgObj.name = result[orgInx]["_source"]["name"][qObj.language];
                orgObj.parentname = result[orgInx]["_source"]["departmentname"][qObj.language];

            }
            orgObj.parentcode = result[orgInx]["_source"].departmentcode;
            orgObj.companycode = result[orgInx]["_source"].companycode;
            orgObj.mycode = result[orgInx]["_source"].empno;
            // var photo = config.mail.photo;
            // photo = photo.replace(/#empno#/g, orgObj.mycode);
            var photoUrl = config.photo;
            photoUrl = photoUrl.replace(/#sabun#/g, orgObj.mycode);
            orgObj.photo = photoUrl;
            orgObj.kinds = result[orgInx]["_source"]["@form"];
            orgObj.approvalInfo = result[orgInx]["_source"].approvalInfo;
            // console.log(result[orgInx]["_source"]["sort"]);
            orgObj.notesId = result[orgInx]["_source"]["notesId"];
            orgArr[orgInx] = orgObj;

        }
        util.writeSuccess(orgArr, res);
    }
    //사용자 정보
    else if (qObj.type === "myinfo") {
        var result = await getMyMailInfo(qObj);
        util.writeSuccess(result, res);
    }
    //조직도 자동완성
    else if (qObj.type === "autoSearch") {
        var result = await autoSearch(qObj);
        util.writeSuccess(result, res);
    }
    //작성양식에 서명,인사말 넣기
    else if (qObj.type === "writeForm") {
        var greetings = await getWriteformGreetings(qObj);
        var signature = await getWriteformSignature(qObj);
        var obj = {};
        obj.greetings = greetings;
        obj.signature = signature;

        util.writeSuccess(obj, res);
    }
    //문서 followup 정보
    else if (qObj.type === "followupInfo") {
        console.log("*********followupInfo***********");
        url = config.host + config.mail.followupInfo;
        url = url.replace("#path#", qObj.mailPath);
        url = url.replace("#unid#", qObj.unid);
        console.log(url);
        var result = await axios({
            method: "get",
            url: url,
            httpsAgent: agent,
            headers: {
                "Content-Type": "application/json",
                "Cookie": qObj.cookie
            },
        })
            .then((response) => {
                return response.data;
            })
            .catch((error) => {
                throw new Error(error);
            });
        // console.log(result);
        if (result.followupStatus == "2") {
            result.followupStatus = true;
        } else {
            result.followupStatus = false;
        }
        var resultObj = {};
        resultObj.use = result.followupStatus;
        resultObj.date = result.followupDate;
        resultObj.time = result.followupTime;
        resultObj.body = result.followupText;
        util.writeSuccess(resultObj, res);
    }
    //첨부파일 정보 보내주기
    else if (qObj.type === "attachInfoSend") {
        await attachInfoSend(qObj, res);
    }
    //자동 저장 하기위해 메일 폼 dockey 가져오기
    else if (qObj.type === "getMailDockey") {
        getMailDockey(qObj, res, req, url);
    }
    //메일 회수
    else if (qObj.type == "recovery") {
        recovery(qObj, res, req, url);
    }
    //메일 본문 호출
    else if (qObj.type == "getBody") {
        var getBody = await mailDetailBody(qObj);
        util.writeSuccess(getBody, res);
    }
};
const post = async (config, qObj, res, req) => {
    if (config.customVersion.toLowerCase().indexOf("swg6") != 0) {
        //비표준, 사이트 수정이 필요한 경우 '/task/customise/...js' 를 수정 하십시오
        var functionName = qObj.functionName;
        const site = require("./customize/" + functionName + ".js");
        site.post(config, qObj, res, req); //사이트 커스터마이즈인 경우 별도함수 호출하고 종료
        return;
    }
    //여기 부터 표준 api 코드 작성
    //사용자 사번 찾기
    var readerArr = qObj.readers.split("/"); //[ 'CN=박광순', 'OU=209003', 'O=SIS' ]
    var sabun = util.strRight(readerArr[1], 'OU='); //209003
    qObj.sabun = sabun;
    //사용자 메일DB 찾기
    var mailPath = await common.getMailPath(qObj);
    //console.log("***************", mailPath);
    qObj.mailPath = mailPath;
    // console.log(qObj);

    //메일전송
    if (qObj.type === "mailsend" || qObj.type === "draftSave" || qObj.type === "draft_edit") {
        console.log("*********************** 메일 전송 ***************************");
        var formdata = new FormData();
        //getMailPersonInfo() = 수신자, 참조자, 숨은참조자의 정보를 이름으로 통해 받아옴 
        /*
        배선일;김현담 => [
                          {"orgnumber":"209002","mailaddress":"sunil66@saerom.co.kr","jobtitle_display":{"ko":"수석연구원","en":"Principal Research Engineer"},"unique_id":"","languages":"ko,en","isdisplay":"Y","title1":{"ko":"수석연구원","en":"Principal Research Engineer"},"gradecode1":"K-SIS_50130","type":"u","shortname":"209002","dept1_shortname":{"ko":"SM파트","en":"SM Part"},"search":"배선일","jojik_cd":"","companycode":"K-SIS","appType":"","dispgrade":"P","name":{"ko":"배선일","en":"Bae Sunil"},"positioncode1":"K-SIS_91000","deptcode1":"K-SIS_300002","company":{"ko":"새롬정보","en":"새롬정보"},"dept1_fullname_separator":{"ko":"새롬정보^GW사업부^SM파트","en":"Saerom^GW Business Department^SM Part"},"indexcode":"","fullname":"배선일/209002/SIS"},
                          {"orgnumber":"ksis211022","mailaddress":"guseka0131@saerom.co.kr","jobtitle_display":{"ko":"책임","en":"책임"},"unique_id":"","languages":"ko,en","isdisplay":"Y","title1":{"ko":"책임","en":"책임"},"gradecode1":"K-SIS_90000","type":"u","shortname":"ksis211022","dept1_shortname":{"ko":"Domino파트","en":"Domino Part"},"search":"김현담","jojik_cd":"","companycode":"K-SIS","appType":"","dispgrade":"P","name":{"ko":"김현담","en":"Kim.Hyeondam"},"positioncode1":"K-SIS_91000","deptcode1":"K-SIS_300001","company":{"ko":"새롬정보","en":"새롬정보"},"dept1_fullname_separator":{"ko":"새롬정보^GW사업부^Domino파트","en":"Saerom^GW Business Department^Domino Part"},"indexcode":"","fullname":"KIM.HYEONDAM/ksis211022/SIS"}
                        ]
        */
        console.log(qObj, "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
        var sendNameInfo = await getMailPersonInfo(qObj, qObj.formdata.ocxSendTo, qObj.formdata.SendTo);
        var copyNameInfo = await getMailPersonInfo(qObj, qObj.formdata.ocxCopyTo, qObj.formdata.CopyTo);
        var bcopyNameInfo = await getMailPersonInfo(qObj, qObj.formdata.ocxBCopyTo, qObj.formdata.BlindCopyTo);
        console.log(sendNameInfo, "#####################################################################");
        //수신인
        formdata.append("SendTo", qObj.formdata.SendTo);
        try {
            if (qObj.formdata.inSendTo.indexOf("@") > -1) {
                var inSendToArr = qObj.formdata.inSendTo.split(";");
                var inSendToConv = "";
                for (var inSendToArrIdx = 0; inSendToArrIdx < inSendToArr.length; inSendToArrIdx++) {
                    if (inSendToArr[inSendToArrIdx].indexOf("@") > -1) {
                        var findArr = inSendToArr[inSendToArrIdx].split("@");
                        var find = `${findArr[0]}<${inSendToArr[inSendToArrIdx]}>`;
                        inSendToConv += find + ";";
                    } else {
                        inSendToConv += inSendToArr[inSendToArrIdx] + ";";
                    }
                }
                qObj.formdata.inSendTo = inSendToConv;
            }
        } catch (e) {
            var findArr = qObj.formdata.inSendTo.split("@");
            var find = `${findArr[0]}<${inSendToArr[inSendToArrIdx]}>`;
            qObj.formdata.inSendTo = find + ";";
        }
        console.log(qObj.formdata.inSendTo, "++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++");
        formdata.append("inSendTo", qObj.formdata.inSendTo);
        formdata.append("ocxSendTo", sendNameInfo);
        formdata.append("confirmSendTo", sendNameInfo);
        //참조자
        formdata.append("CopyTo", qObj.formdata.CopyTo);
        formdata.append("ocxCopyTo", copyNameInfo);
        //숨음 참조자
        formdata.append("BlindCopyTo", qObj.formdata.BlindCopyTo);
        formdata.append("ocxBCopyTo", bcopyNameInfo);
        //제목
        formdata.append("Subject", qObj.formdata.Subject);
        //발송자 이메일
        formdata.append("MailAddress", `<${qObj.uid}>`);
        //중요 메일 : 1, 일반 메일 : 2
        formdata.append("Importance", qObj.formdata.Importance);
        formdata.append("Importance_1", qObj.formdata.Importance);
        //예약 전송시 수정
        if (qObj.formdata.dispreserve == '1') {
            formdata.append("ExpireDate", qObj.formdata.ExpireDate); // 날짜 YYYY-MM-DD
            formdata.append("STime", qObj.formdata.STime); // 시간 00~24
            formdata.append("SMin", qObj.formdata.SMin); // 분 00~60
            formdata.append("dispreserve", qObj.formdata.dispreserve); //예약 전송시 :1
        }
        formdata.append("MimeVersion", "");

        //지연발송 사용시
        formdata.append("delaysend_use", qObj.formdata.delaysend_use);
        //나에게 쓰기 사용:"Y", 사용안함:""
        formdata.append("ToMe", qObj.formdata.ToMe);
        //첨부파일
        for (var attachInx = 0; attachInx < qObj.file.length; attachInx++) {
            //console.log("첨부 정보", qObj.file[attachInx].buffer);
            formdata.append("%%File.2", qObj.file[attachInx].buffer, { filename: qObj.file[attachInx].originalname });
        }
        //본문
        //임시 자동 저장 'MIME-Version: 1.0 Content-Type: text/html; charset="utf-8" Content-Transfer-Encoding: base64'
        //console.log("ssssss", qObj.formdata.Body_Text);
        if (qObj.type == "draftSave" || qObj.type === "draft_edit") {
            formdata.append("autoSave4Status", "");
            formdata.append("SaveAgent", "wSave");
            // qObj.formdata.Body_Text = Buffer.from(qObj.formdata.Body_Text, "utf8").toString("base64");
            formdata.append("Body_Text", qObj.formdata.Body_Text);
            formdata.append("Body", qObj.formdata.Body_Text);
            // formdata.append("Body", qObj.formdata.Body_Text);
        } else if (qObj.type == "mailsend") {
            formdata.append("autoSave4Status", "");
            formdata.append("SaveAgent", "wSend");
            formdata.append("Body_Text", qObj.formdata.Body_Text);
            formdata.append("Body", qObj.formdata.Body_Text);
        }
        if (qObj.formdata.MailTypeOption == undefined || qObj.type === "draft_edit") {
            formdata.append("MailTypeOption", ""); //전달일때 : Forward   답장일때 : Reply
        } else {
            formdata.append("MailTypeOption", qObj.formdata.MailTypeOption); //전달일때 : Forward   답장일때 : Reply
        }
        if (qObj.formdata.unid == undefined || qObj.type === "draft_edit") {
            formdata.append("MailTypeDocid", "");

        } else {
            formdata.append("MailTypeDocid", qObj.formdata.unid);
        }
        if (qObj.formdata.docType == undefined || qObj.type === "draft_edit") {
            formdata.append("docType", ""); //전달일때 : Forward   답장일때 : Forward
        } else {
            formdata.append("docType", qObj.formdata.docType); //전달일때 : Forward   답장일때 : Forward
        }
        try {
            var detachArr = qObj.formdata.Detach.split(";");
            for (var detachIdx = 0; detachIdx < detachArr.length; detachIdx++) {
                formdata.append("%%Detach", detachArr[detachIdx]); //기존 첨부에서 빠진 파일 이름
            }
        } catch (e) {
            formdata.append("%%Detach", ""); //기존 첨부에서 빠진 파일 이름
        }

        ////////////////////////////////아래부터 고정값//////////////////////////////////////////////
        formdata.append("__Click", 0);
        formdata.append("profileOutTotalCount", "1");
        formdata.append("profileOutTotalCountToday", "20210629");
        formdata.append("autoSave4Key", "");
        formdata.append("megaAttachURL", "");
        formdata.append("megaFileName", "");
        formdata.append("megaFileSize", "");
        formdata.append("megaFileKey", "");
        formdata.append("megaValidFrom", "");
        formdata.append("megaValidTo", "");
        formdata.append("megaUrl", "");
        formdata.append("%%Surrogate_ToMe", 1);
        formdata.append("%%Surrogate_seqmailoption", 1);
        formdata.append("inCopyTo", "");
        formdata.append("confirmCopyTo", "");
        formdata.append("inBlindCopyTo", "");
        formdata.append("confirmBlindCopyTo", "");
        formdata.append("%%Surrogate_Importance_1", 1);
        formdata.append("%%Surrogate_ReturnReceipt", 1);
        formdata.append("%%Surrogate_dispreserve", 1);
        formdata.append("%%Surrogate_STime", 1);
        formdata.append("%%Surrogate_SMin", 1);
        formdata.append("selectintro", "");
        formdata.append("selectsign", "");
        formdata.append("EditerUse", "");
        formdata.append("namoeditor1", "<p>Welcome to <span style='font-weight:bold'>CrossEditor</span> sample page</p>");
        formdata.append("imgname", "");
        formdata.append("imgpath", "");
        formdata.append("imgurl", "");
        formdata.append("SendOptions", 2);
        formdata.append("nh_Type", "");
        formdata.append("NickName", "");
        formdata.append("OutRecipientsTotalCount", 0);
        formdata.append("returnreceiptdata", "");
        formdata.append("delSendList", "");
        formdata.append("HeadSub", 0);
        formdata.append("SecurityFlag", "");
        formdata.append("AutoDelete", 0);
        formdata.append("megaFileName", "");
        formdata.append("megaFileSize", "");
        formdata.append("megaFileKey", "");
        formdata.append("megaValidFrom", "");
        formdata.append("megaValidTo", "");
        formdata.append("megaUrl", "");
        formdata.append("previous_subject", "");
        formdata.append("previous_from", "");
        formdata.append("previous_date", "");
        formdata.append("previous_to", "");
        formdata.append("previous_cc", "");
        formdata.append("replyTo", "");
        formdata.append("linkBBSURL", "");
        formdata.append("webmenu_btn", "");
        formdata.append("ReturnReceipt", 1);
        ////////////////////////////////////////
        // console.log(formdata, "ssssssssssssssssssssssssssssssss");
        if (qObj.type == "draft_edit") {
            var url = config.mail.draft_edit;
            url = url.replace("#path#", qObj.mailPath);
            url = url.replace("#unid#", qObj.formdata.unid);
        }
        else if (qObj.formdata.MailTypeOption == "Forward") {
            var url = config.mail.forward;
            url = url.replace("#path#", qObj.mailPath);
            url = url.replace(/#unid#/g, qObj.formdata.unid);
        } else {
            var url = config.mail.send;
            url = url.replace("#path#", qObj.mailPath);
        }



        console.log(url);
        console.log(formdata.getHeaders()["content-type"], "????????????????????????");
        //httpsAgent: agent,
        await axios({
            method: "post",
            url: config.host + url,

            headers: {
                "Content-Type": formdata.getHeaders()["content-type"],
                "Cookie": qObj.cookie,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.159 Safari/537.36"
            },
            data: formdata
        })
            .then((response) => {
                // console.log(response,"???????????????");
                if (response.status == 200) {
                    console.log("******************* 메일 전송 완료 *******************");
                    util.writeSuccess('Done', res);
                } else {
                    console.log(response);
                    return;
                }
                // util.writeSuccess(response.data, res);
            })
            .catch((error) => {
                throw new Error(error);
            });



        // formdata.submit({
        //     host: config.submitHost,
        //     path: url,
        //     httpsAgent: agent,
        //     headers: {
        //         'cookie': qObj.cookie,
        //         'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/95.0.4638.54 Safari/537.36'
        //     }
        // }, function (err, resp) {
        //     console.log(err,"err??????????????????????????????????");
        //     console.log(resp,"resp??????????????????????????????????");
        //     // if (err) throw err;
        //     // console.log(resp,"OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO");
        //     //console.log("statusCode : ", res.statusCode);
        //     if (res.statusCode == 200) {
        //         console.log("******************* 메일 전송 완료 *******************");
        //     }

        //     util.writeSuccess('Done', res);
        // });

    }
    //자동저장
    else if (qObj.type === "autoSave") {
        console.log("*********************** 자동저장 ***************************");
        //console.log(qObj);
        // var formdata = new FormData();
        const formdata = new URLSearchParams();
        //getMailPersonInfo() = 수신자, 참조자, 숨은참조자의 정보를 이름으로 통해 받아옴 
        /*
        배선일;김현담 => [
                          {"orgnumber":"209002","mailaddress":"sunil66@saerom.co.kr","jobtitle_display":{"ko":"수석연구원","en":"Principal Research Engineer"},"unique_id":"","languages":"ko,en","isdisplay":"Y","title1":{"ko":"수석연구원","en":"Principal Research Engineer"},"gradecode1":"K-SIS_50130","type":"u","shortname":"209002","dept1_shortname":{"ko":"SM파트","en":"SM Part"},"search":"배선일","jojik_cd":"","companycode":"K-SIS","appType":"","dispgrade":"P","name":{"ko":"배선일","en":"Bae Sunil"},"positioncode1":"K-SIS_91000","deptcode1":"K-SIS_300002","company":{"ko":"새롬정보","en":"새롬정보"},"dept1_fullname_separator":{"ko":"새롬정보^GW사업부^SM파트","en":"Saerom^GW Business Department^SM Part"},"indexcode":"","fullname":"배선일/209002/SIS"},
                          {"orgnumber":"ksis211022","mailaddress":"guseka0131@saerom.co.kr","jobtitle_display":{"ko":"책임","en":"책임"},"unique_id":"","languages":"ko,en","isdisplay":"Y","title1":{"ko":"책임","en":"책임"},"gradecode1":"K-SIS_90000","type":"u","shortname":"ksis211022","dept1_shortname":{"ko":"Domino파트","en":"Domino Part"},"search":"김현담","jojik_cd":"","companycode":"K-SIS","appType":"","dispgrade":"P","name":{"ko":"김현담","en":"Kim.Hyeondam"},"positioncode1":"K-SIS_91000","deptcode1":"K-SIS_300001","company":{"ko":"새롬정보","en":"새롬정보"},"dept1_fullname_separator":{"ko":"새롬정보^GW사업부^Domino파트","en":"Saerom^GW Business Department^Domino Part"},"indexcode":"","fullname":"KIM.HYEONDAM/ksis211022/SIS"}
                        ]
        */
        //console.log(qObj, "!!!!!!!!!!!!!");
        var sendNameInfo = await getMailPersonInfo(qObj, qObj.formdata.ocxSendTo, qObj.formdata.SendTo);
        var copyNameInfo = await getMailPersonInfo(qObj, qObj.formdata.ocxCopyTo, qObj.formdata.CopyTo);
        var bcopyNameInfo = await getMailPersonInfo(qObj, qObj.formdata.ocxBCopyTo, qObj.formdata.BlindCopyTo);
        //수신인
        formdata.append("SendTo", qObj.formdata.SendTo);
        formdata.append("inSendTo", qObj.formdata.inSendTo);
        formdata.append("ocxSendTo", sendNameInfo);
        formdata.append("confirmSendTo", sendNameInfo);
        //참조자
        formdata.append("CopyTo", qObj.formdata.CopyTo);
        formdata.append("ocxCopyTo", copyNameInfo);
        //숨음 참조자
        formdata.append("BlindCopyTo", qObj.formdata.BlindCopyTo);
        formdata.append("ocxBCopyTo", bcopyNameInfo);
        //제목
        formdata.append("Subject", qObj.formdata.Subject);
        //발송자 이메일
        formdata.append("MailAddress", `<${qObj.uid}>`);
        //중요 메일 : 1, 일반 메일 : 2
        formdata.append("Importance", qObj.formdata.Importance);
        formdata.append("Importance_1", qObj.formdata.Importance);
        //예약 전송시 수정
        formdata.append("ExpireDate", qObj.formdata.ExpireDate); // 날짜 YYYY-MM-DD
        formdata.append("STime", qObj.formdata.STime); // 시간 00~24
        formdata.append("SMin", qObj.formdata.SMin); // 분 00~60
        formdata.append("dispreserve", qObj.formdata.dispreserve); //예약 전송시 :1
        formdata.append("MimeVersion", "MIME-Version: 1.0");
        //지연발송 사용시
        formdata.append("delaysend_use", qObj.formdata.delaysend_use);
        //나에게 쓰기 사용:"Y", 사용안함:""
        formdata.append("ToMe", qObj.formdata.ToMe);
        //첨부파일
        // for (var attachInx = 0; attachInx < qObj.file.length; attachInx++) {
        //     formdata.append("%%File.2", qObj.file[attachInx].buffer, { filename: qObj.file[attachInx].originalname });
        // }
        //본문
        //임시 자동 저장 'MIME-Version: 1.0 Content-Type: text/html; charset="utf-8" Content-Transfer-Encoding: base64'
        // console.log("ssssss", qObj.formdata.Body_Text);
        formdata.append("autoSave4Status", "Y");
        formdata.append("SaveAgent", "wSave");
        // var HTMLParser = require('node-html-parser');
        // var bodytext = HTMLParser.parse(qObj.formdata.Body_Text);
        formdata.append("Body_Text", qObj.formdata.Body_Text);
        // qObj.formdata.Body_Text = Buffer.from(qObj.formdata.Body_Text, "utf8").toString("base64");
        formdata.append("Body", qObj.formdata.Body_Text);
        // console.log(bodytext, "WWWWWWWWWWWWWWWWWWW");
        formdata.append("autoSave4Key", qObj.formdata.dockey);
        ////////////////////////////////아래부터 고정값//////////////////////////////////////////////
        formdata.append("__Click", 0);
        formdata.append("megaAttachURL", "");
        formdata.append("megaFileName", "");
        formdata.append("megaFileSize", "");
        formdata.append("megaFileKey", "");
        formdata.append("megaValidFrom", "");
        formdata.append("megaValidTo", "");
        formdata.append("megaUrl", "");
        formdata.append("%%Surrogate_ToMe", 1);
        formdata.append("%%Surrogate_seqmailoption", 1);
        formdata.append("inCopyTo", "");
        formdata.append("confirmCopyTo", "");
        formdata.append("inBlindCopyTo", "");
        formdata.append("confirmBlindCopyTo", "");
        formdata.append("%%Surrogate_Importance_1", 1);
        formdata.append("%%Surrogate_ReturnReceipt", 1);
        formdata.append("%%Surrogate_dispreserve", 1);
        formdata.append("%%Surrogate_STime", 1);
        formdata.append("%%Surrogate_SMin", 1);
        formdata.append("selectintro", "");
        formdata.append("selectsign", "");
        formdata.append("EditerUse", "");
        formdata.append("namoeditor1", "<p>Welcome to <span style='font-weight:bold'>CrossEditor</span> sample page</p>");
        formdata.append("imgname", "");
        formdata.append("imgpath", "");
        formdata.append("imgurl", "");
        formdata.append("SendOptions", 2);
        formdata.append("nh_Type", "");
        formdata.append("docType", "");
        formdata.append("NickName", "");
        formdata.append("OutRecipientsTotalCount", 0);
        formdata.append("returnreceiptdata", "");
        formdata.append("delSendList", "");
        formdata.append("HeadSub", 0);
        formdata.append("SecurityFlag", "");
        formdata.append("AutoDelete", 0);
        formdata.append("MailTypeOption", "");
        formdata.append("MailTypeDocid", "");
        formdata.append("megaFileName", "");
        formdata.append("megaFileSize", "");
        formdata.append("megaFileKey", "");
        formdata.append("megaValidFrom", "");
        formdata.append("megaValidTo", "");
        formdata.append("megaUrl", "");
        formdata.append("previous_subject", "");
        formdata.append("previous_from", "");
        formdata.append("previous_date", "");
        formdata.append("previous_to", "");
        formdata.append("previous_cc", "");
        formdata.append("replyTo", "");
        formdata.append("linkBBSURL", "");
        formdata.append("webmenu_btn", "");
        formdata.append("profileOutTotalCount", 1);
        formdata.append("profileOutTotalCountToday", 20210629);
        formdata.append("ReturnReceipt", 1);
        ////////////////////////////////////////
        //console.log(formdata, "ssssssssssssssssssssssssssssssss");
        var url = config.host + config.mail.autoSave;
        url = url.replace("#path#", qObj.mailPath);
        await axios({
            method: "post",
            url: url,
            httpsAgent: agent,
            headers: {
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "Cookie": qObj.cookie,
            },
            data: formdata
        })
            .then((response) => {
                console.log("자동저장");
                //기존 문서 삭제하기
                var deleteUrl = config.host + config.mail.autoSave_delete
                deleteUrl = deleteUrl.replace("#path#", qObj.mailPath);
                deleteUrl = deleteUrl.replace("#dockey#", qObj.formdata.dockey);
                axios({
                    method: "get",
                    url: deleteUrl,
                    httpsAgent: agent,
                    headers: {
                        "Content-Type": "application/json",
                        "Cookie": qObj.cookie,
                    },
                    data: formdata
                })
                    .then((response) => {
                        console.log("기존 문서 삭제");
                    })
                    .catch((error) => {
                        throw new Error(error);
                    });
                util.writeSuccess('Done', res);
                return;
            })
            .catch((error) => {
                throw new Error(error);
            });
    }
    //폴더 이동
    else if (qObj.type === "moveFolder") {
        // console.log(qObj);
        var url = config.host + config.mail.moveFolder;
        url = url.replace(/#path#/, mailPath);
        url = url.replace(/#folderId#/, qObj.folderId);
        console.log(url);

        const formdata = new URLSearchParams();
        formdata.append('ids', qObj.ids);
        formdata.append('viewname', qObj.viewname);

        await axios({
            method: "post",
            url: url,
            httpsAgent: agent,
            headers: {
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "Cookie": qObj.cookie,
            },
            data: formdata
        })
            .then((response) => {
                // console.log("^^^^^^^^^^^", response);
                //console.log("^^^^^^^^^^^", response.status);
                util.writeSuccess('Done', res);
                return;
            })
            .catch((error) => {
                throw new Error(error);
            });
    }
    //서명 추가
    else if (qObj.type === "signatureAdd") {
        console.log("서명 추가");
        // console.log(qObj);
        if (qObj.default == true) {
            qObj.default = 1;
        } else {
            qObj.default = "";
        }
        var formdata = new FormData();
        formdata.append("__Click", 0);
        formdata.append("Subject", qObj.subject);
        formdata.append("%%Surrogate_UseDefault", 1);
        formdata.append("UseDefault", qObj.default); // 기본 서명으로 설정 : 1
        formdata.append("EditerUse", "");
        formdata.append("namoeditor1", "<p>Welcome to <span style='font-weight:bold'>CrossEditor</span> sample page</p>");
        formdata.append("imgname", "");
        formdata.append("imgpath", "");
        formdata.append("imgurl", "");
        formdata.append("MimeVersion", "");
        formdata.append("Body_Text", qObj.body);
        formdata.append("Body", qObj.body);
        formdata.append("SaveOptions", 1);
        formdata.append("DelAttachNames", "");
        formdata.append("selectedMultiList", "");
        formdata.append("ocxSendTo", "");
        formdata.append("DisSendTo", "");
        formdata.append("SendTo", "");
        formdata.append("wh_Dis_SendTo", "");

        await axios({
            method: "post",
            url: config.host + `/${qObj.mailPath}/form01?OpenForm&Seq=1&ui=webmail&viewname=profile&viewcode=`,

            headers: {
                "Content-Type": formdata.getHeaders()["content-type"],
                "Cookie": qObj.cookie,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.159 Safari/537.36"
            },
            data: formdata
        })
            .then((response) => {
                // console.log(response,"???????????????");
                if (response.status == 200) {
                    console.log("서명추가완료");
                    util.writeSuccess('Done', res);
                } else {
                    console.log(response);
                    return;
                }
                // util.writeSuccess(response.data, res);
            })
            .catch((error) => {
                throw new Error(error);
            });

        // formdata.submit({
        //     host: config.submitHost,
        //     path: `/${qObj.mailPath}/form01?OpenForm&Seq=1&ui=webmail&viewname=profile&viewcode=`,
        //     headers: {
        //         'cookie': qObj.cookie
        //     }
        // }, function (err, resp) {
        //     // if (err) throw err;
        //     // console.log("@@@@@@@@@@@@@@@@resp@@@@@@@@@@@@@@@@@@@@@@", resp);
        //     //console.log(res.statusCode);
        //     console.log("??????????????");
        //     util.writeSuccess('Done', res);
        // });

    }
    //인사말 추가
    else if (qObj.type === "greetingsAdd") {
        console.log("인사말 추가");
        // console.log(qObj);
        var formdata = new FormData();
        if (qObj.default == true) {
            qObj.default = 1;
        } else if (qObj.default == false) {
            qObj.default = "";
        }
        // console.log("ssssssssssss",qObj.subject);
        // console.log("ssssssssssss",qObj.default);
        // console.log("ssssssssssss",qObj.body);
        formdata.append("__Click", 0);
        formdata.append("Subject", qObj.subject);
        formdata.append("%%Surrogate_UseDefault", 1);
        formdata.append("UseDefault", qObj.default); // 기본 서명으로 설정 : 1
        formdata.append("EditerUse", "");
        formdata.append("namoeditor1", "<p>Welcome to <span style='font-weight:bold'>CrossEditor</span> sample page</p>");
        formdata.append("imgname", "");
        formdata.append("imgpath", "");
        formdata.append("imgurl", "");
        formdata.append("MimeVersion", "");
        formdata.append("Body_Text", qObj.body);
        formdata.append("Body", qObj.body);
        formdata.append("SaveOptions", 1);
        formdata.append("DelAttachNames", "");
        formdata.append("selectedMultiList", "");
        formdata.append("ocxSendTo", "");
        formdata.append("DisSendTo", "");
        formdata.append("SendTo", "");
        formdata.append("wh_Dis_SendTo", "");
        // formdata.append("UseDefault", "1"); // 기본 서명으로 설정 : 1
        // formdata.append("EditerUse", "");
        // formdata.append("namoeditor1", "<p>Welcome to <span style='font-weight:bold'>CrossEditor</span> sample page</p>");
        // formdata.append("imgname", "");
        // formdata.append("imgpath", "");
        // formdata.append("imgurl", "");
        // formdata.append("MimeVersion", "");
        // formdata.append("Body_Text", '안녕하세요??@@');
        // formdata.append("Body", '안녕하세요??@@');
        // formdata.append("SaveOptions", 1);
        // formdata.append("DelAttachNames", "");
        // formdata.append("selectedMultiList", "");
        // formdata.append("ocxSendTo", "");
        // formdata.append("DisSendTo", "");
        // formdata.append("SendTo", "");
        // formdata.append("wh_Dis_SendTo", "");

        await axios({
            method: "post",
            url: config.host + `/${qObj.mailPath}/intro?OpenForm&Seq=1&ui=webmail&viewname=introView&viewcode=`,

            headers: {
                "Content-Type": formdata.getHeaders()["content-type"],
                "Cookie": qObj.cookie,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.159 Safari/537.36"
            },
            data: formdata
        })
            .then((response) => {
                // console.log(response,"???????????????");
                if (response.status == 200) {
                    console.log("인사말추가완료");
                    util.writeSuccess('Done', res);
                } else {
                    console.log(response);
                    return;
                }
                // util.writeSuccess(response.data, res);
            })
            .catch((error) => {
                throw new Error(error);
            });

        // formdata.submit({
        //     host: config.submitHost,
        //     path: `/${qObj.mailPath}/intro?OpenForm&Seq=1&ui=webmail&viewname=introView&viewcode=`,
        //     headers: {
        //         'cookie': qObj.cookie
        //     }
        // }, function (err, resp) {
        //     if (err) throw err;
        //     // console.log("@@@@@@@@@@@@@@@@resp@@@@@@@@@@@@@@@@@@@@@@", resp);
        //     // console.log(res.statusCode);
        //     util.writeSuccess('Done', res);
        //     return;
        // });

    }
    //자동저장 설정
    else if (qObj.type === "autoSaveSet") {
        // console.log(qObj);
        url = config.host + config.mail.setting.autoSaveSet;
        url = url.replace(/#path#/, mailPath);
        console.log(url);
        if (qObj.use == true) {
            qObj.use = "Y";
        } else if (qObj.use == false) {
            qObj.use = "N";
        }
        const formdata = new URLSearchParams();
        formdata.append('__Click', 0);
        formdata.append('%%Surrogate_autoSave4Usage', 1);
        formdata.append('autoSave4Usage', qObj.use);
        formdata.append('%%Surrogate_autoSave4Time', 1);
        formdata.append('autoSave4Time', qObj.time);
        formdata.append('%%Surrogate_autoSave4DelDay', 1);
        formdata.append('autoSave4DelDay', qObj.day);

        await axios({
            method: "post",
            url: url,
            httpsAgent: agent,
            headers: {
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "Cookie": qObj.cookie,
            },
            data: formdata
        })
            .then((response) => {
                console.log("^^^^^^^^^^^", response.status);
                util.writeSuccess('Done', res);
                return;
            })
            .catch((error) => {
                throw new Error(error);
            });
    }
    //지연저장 설정
    else if (qObj.type === "delaySet") {
        // console.log(qObj);
        url = config.host + config.mail.setting.delaySet;
        url = url.replace(/#path#/, mailPath);
        console.log(url);
        if (qObj.use == true) {
            qObj.use = "Y";
        } else if (qObj.use == false) {
            qObj.use = "N";
        }
        const formdata = new URLSearchParams();
        formdata.append('__Click', 0);
        formdata.append('%%Surrogate_delaysend_use', 1);
        formdata.append('delaysend_use', qObj.use);
        formdata.append('%%Surrogate_delaysend_time', 1);
        formdata.append('delaysend_time', qObj.time);
        formdata.append('SendTo', 1);
        formdata.append('ConditionList', "");
        formdata.append('tokConditionList', "");
        formdata.append('delSendList', "");

        await axios({
            method: "post",
            url: url,
            httpsAgent: agent,
            headers: {
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "Cookie": qObj.cookie,
            },
            data: formdata
        })
            .then((response) => {
                //console.log("^^^^^^^^^^^", response.status);
                util.writeSuccess('Done', res);
                return;
            })
            .catch((error) => {
                throw new Error(error);
            });
    }
    //followup 설정
    else if (qObj.type === "followupSet") {
        // console.log(qObj);
        url = config.host + config.mail.followupSet;
        url = url.replace(/#path#/, mailPath);
        url = url.replace(/#unid#/, qObj.unid);
        console.log(url);
        if (qObj.use == true) {
            qObj.use = 2;
        } else if (qObj.use == false) {
            qObj.use = "";
        }
        const formdata = new URLSearchParams();
        formdata.append('followupstatus', qObj.use);
        formdata.append('followuptext', qObj.body);
        formdata.append('followupdate', qObj.date);
        formdata.append('followuptime', qObj.time);

        await axios({
            method: "post",
            url: url,
            httpsAgent: agent,
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Cookie": qObj.cookie,
            },
            data: formdata
        })
            .then((response) => {
                // console.log("^^^^^^^^^^^", response.status);
                util.writeSuccess('Done', res);
                return;
            })
            .catch((error) => {
                throw new Error(error);
            });
    }
    //서명 수정
    else if (qObj.type === "signatureEdit") {
        console.log("서명 수정");
        // console.log(qObj);
        if (qObj.default == true) {
            qObj.default = 1;
        } else {
            qObj.default = "";
        }
        var formdata = new FormData();
        formdata.append("__Click", 0);
        formdata.append("%%ModDate", "4925871B000A9C37");
        formdata.append("Subject", qObj.subject);
        formdata.append("%%Surrogate_UseDefault", 1);
        formdata.append("EditerUse", "");
        formdata.append("namoeditor1", "<p>Welcome to <span style='font-weight:bold'>CrossEditor</span> sample page</p>");
        formdata.append("imgname", "");
        formdata.append("imgpath", "");
        formdata.append("imgurl", "");
        formdata.append("MimeVersion", "");
        formdata.append("Body_Text", qObj.body);
        formdata.append("Body", qObj.body);
        formdata.append("SaveOptions", 1);
        formdata.append("DelAttachNames", "");
        formdata.append("selectedMultiList", "");
        formdata.append("ocxSendTo", "");
        formdata.append("DisSendTo", "");
        formdata.append("SendTo", "");
        formdata.append("wh_Dis_SendTo", "");
        formdata.append("UseDefault", qObj.default); // 기본 서명으로 설정 : 1

        await axios({
            method: "post",
            url: config.host + `/${qObj.mailPath}/profile/${qObj.unid}?EditDocument&Seq=1&ui=webmail&docOptions=2`,

            headers: {
                "Content-Type": formdata.getHeaders()["content-type"],
                "Cookie": qObj.cookie,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.159 Safari/537.36"
            },
            data: formdata
        })
            .then((response) => {
                // console.log(response,"???????????????");
                if (response.status == 200) {
                    console.log("서명수정완료");
                    util.writeSuccess('Done', res);
                } else {
                    console.log(response);
                    return;
                }
                // util.writeSuccess(response.data, res);
            })
            .catch((error) => {
                throw new Error(error);
            });

        // formdata.submit({
        //     host: config.submitHost,
        //     path: `/${qObj.mailPath}/profile/${qObj.unid}?EditDocument&Seq=1&ui=webmail&docOptions=2`,
        //     headers: {
        //         'cookie': qObj.cookie
        //     }
        // }, function (err, resp) {
        //     if (err) throw err;
        //     // console.log("@@@@@@@@@@@@@@@@resp@@@@@@@@@@@@@@@@@@@@@@", resp);
        //     console.log(res.statusCode);
        //     util.writeSuccess('Done', res);
        // });
    }
    //인사말 수정
    else if (qObj.type === "greetingsEdit") {
        console.log("인사말 수정");
        // console.log(qObj);
        if (qObj.default == true) {
            qObj.default = 1;
        } else {
            qObj.default = "";
        }
        var formdata = new FormData();
        formdata.append("__Click", 0);
        formdata.append("%%ModDate", "49258711002B5D2E");
        formdata.append("Subject", qObj.subject);
        formdata.append("%%Surrogate_UseDefault", 1);
        formdata.append("EditerUse", "");
        formdata.append("namoeditor1", "<p>Welcome to <span style='font-weight:bold'>CrossEditor</span> sample page</p>");
        formdata.append("imgname", "");
        formdata.append("imgpath", "");
        formdata.append("imgurl", "");
        formdata.append("MimeVersion", "");
        formdata.append("Body_Text", qObj.body);
        formdata.append("Body", qObj.body);
        formdata.append("SaveOptions", 1);
        formdata.append("DelAttachNames", "");
        formdata.append("selectedMultiList", "");
        formdata.append("ocxSendTo", "");
        formdata.append("DisSendTo", "");
        formdata.append("SendTo", "");
        formdata.append("wh_Dis_SendTo", "");
        formdata.append("UseDefault", qObj.default); // 기본 서명으로 설정 : 1
        console.log(config.host + `/${qObj.mailPath}/introView/${qObj.unid}?EditDocument&Seq=1&ui=webmail&docOptions=2`, "????????????????????");
        await axios({
            method: "post",
            url: config.host + `/${qObj.mailPath}/introView/${qObj.unid}?EditDocument&Seq=1&ui=webmail&docOptions=2`,

            headers: {
                "Content-Type": formdata.getHeaders()["content-type"],
                "Cookie": qObj.cookie,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.159 Safari/537.36"
            },
            data: formdata
        })
            .then((response) => {
                // console.log(response,"???????????????");
                if (response.status == 200) {
                    console.log("인사말수정완료");
                    util.writeSuccess('Done', res);
                } else {
                    // console.log(response);
                    return;
                }
                // util.writeSuccess(response.data, res);
            })
            .catch((error) => {
                throw new Error(error);
            });

        // formdata.submit({
        //     host: config.submitHost,
        //     path: `/${qObj.mailPath}/introView/${qObj.unid}?EditDocument&Seq=1&ui=webmail&docOptions=2`,
        //     headers: {
        //         'cookie': qObj.cookie
        //     }
        // }, function (err, resp) {
        //     if (err) throw err;
        //     // console.log("@@@@@@@@@@@@@@@@resp@@@@@@@@@@@@@@@@@@@@@@", resp);
        //     // console.log(res.statusCode);
        //     util.writeSuccess('Done', res);
        // });
    }
    //스팸 설정
    else if (qObj.type === "spamSet") {
        // console.log(qObj);
        var url = config.host + config.mail.setting.spamSet;
        url = url.replace(/#path#/, mailPath);
        console.log(url);

        const formdata = new URLSearchParams();
        formdata.append('RejectName', qObj.title);
        formdata.append('RejectAddress', qObj.email);
        formdata.append('OldRejectAddress', qObj.email);

        await axios({
            method: "post",
            url: url,
            httpsAgent: agent,
            headers: {
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "Cookie": qObj.cookie,
            },
            // ids: "5FF931FF3BFA3F244925870C00171FC2",
            // viewname: "프로젝트",
            data: formdata
        })
            .then((response) => {
                // console.log("^^^^^^^^^^^", response);
                // console.log("^^^^^^^^^^^", response.status);
                util.writeSuccess('Done', res);
                return;
            })
            .catch((error) => {
                throw new Error(error);
            });
    }


};
const put = async (config, qObj, res, req) => {
    if (config.customVersion.toLowerCase().indexOf("swg6") != 0) {
        //비표준, 사이트 수정이 필요한 경우 '/task/customise/...js' 를 수정 하십시오
        var functionName = qObj.functionName;
        const site = require("./customize/" + functionName + ".js");
        site.put(config, qObj, res, req); //사이트 커스터마이즈인 경우 별도함수 호출하고 종료
        return;
    }
    //여기 부터 표준 api 코드 작성
};
const del = async (config, qObj, res, req) => {
    if (config.customVersion.toLowerCase().indexOf("swg6") != 0) {
        //비표준, 사이트 수정이 필요한 경우 '/task/customise/...js' 를 수정 하십시오
        var functionName = qObj.functionName;
        const site = require("./customize/" + functionName + ".js");
        site.del(config, qObj, res, req); //사이트 커스터마이즈인 경우 별도함수 호출하고 종료
        return;
    }

    //사용자 메일DB 찾기
    var mailPath = await common.getMailPath(qObj);
    //console.log("***************", mailPath);
    qObj.mailPath = mailPath;

    // console.log(qObj);
    if (qObj.type == "delete_set") {
        var url = config.host + config.mail.setting.delete;
        url = url.replace(/#unid#/, qObj.unid);
        url = url.replace(/#mailpath#/, qObj.mailPath);
        console.log(url);
        await axios({
            method: "get",
            url: url,
            httpsAgent: agent,
            headers: {
                "Content-Type": "text/html; charset=UTF-8",
                "Cookie": qObj.cookie
            },
            data: req.query['0']
        })
            .then((response) => {
                // console.log("^^^^^^^^^^^", response);
                res.statusCode = 200;
                res.setHeader("Content-type", "application/json; charset=UTF-8");
                res.send("삭제완료");
                return;
            })
            .catch((error) => {
                throw new Error(error);
            });
    } else if (qObj.type == "select_delete") {
        var url = config.host + config.mail.select_delete;
        url = url.replace("#path#", qObj.mailPath);
        await deleteSchedule(qObj, res, req, url);
    } else {
        //여기 부터 표준 api 코드 작성
        var url = config.host + config.mail.delete;
        url = url.replace(/#path#/, qObj.mailPath);
        console.log(url);
        await axios({
            method: "post",
            url: url,
            httpsAgent: agent,
            headers: {
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "Cookie": qObj.cookie
            },
            data: req.query['0']
        })
            .then((response) => {
                // console.log("^^^^^^^^^^^", response);
                res.statusCode = 200;
                res.setHeader("Content-type", "application/json; charset=UTF-8");
                res.send("삭제완료");
                return;
            })
            .catch((error) => {
                throw new Error(error);
            });
    }

};
//사진, 첨부파일 정보 구하기 (사용안함)
async function getPA(qObj, req) {

    var url = `https://swg60.saerom.co.kr/${qObj.mailPath}/api/data/collections/name/${qObj.viewName2}?ps=${qObj.size}&page=${qObj.page}`;
    console.log("사진 첨부", url);
    var result = await axios({
        method: 'get',
        url: url,
        httpsAgent: agent,
        headers: {
            "Cookie": qObj.cookie,
            'Content-Type': 'application/json'
        }
    }).then((response) => {
        result = response.data;
        // console.log(result);
        var resArr = [];
        var revArr = [];
        var att = '';
        for (var i = 0; i < result.length; i++) {
            var paObj = {};
            att = result[i]['$att'].split('|');
            paObj.attach = att;
            paObj.photo = result[i]['$rev'];
            if (qObj.type == 'inbox_detail') {
                revArr = paObj.photo.split('&');
                //발신자 사번 찾기(사진)
                for (var x = 0; x < revArr.length; x++) {
                    if (revArr[x].indexOf('ORG_UNIT') > -1) {
                        paObj.photo = util.strRight(revArr[x], '=');
                    }
                }
            } else if (qObj.type == 'mail_inner') {

            }
            resArr[i] = paObj;
        }
        return resArr;
    })
    return result;
}
//메일함 리스트
async function getMailDetail(qObj, res, req, url) {
    //iNotes URL을 이용하려면 'Referer'를 확인하므로 iNotes Root 페이지를 방문해야 한다.    var referUrl = url;
    referUrl = util.strLeft(url, ".nsf", true);
    axios({
        method: "get",
        url: referUrl,
        httpsAgent: agent,
        headers: {
            "Cookie": qObj.cookie
        },
    }).then(function (response) {
        // console.log(response);
        return null;
    }).then((rslt) => getRealMailDetail(qObj, res, req, url));
}

async function getRealMailDetail(qObj, res, req, url) {
    // console.log(url);
    axios({
        method: "get",
        url: url,
        httpsAgent: agent,
        headers: {
            "Content-Type": "application/json",
            "Cookie": qObj.cookie
        },
    }).then(function (response) {
        return response.data;;
    }).then((rslt) => getProcessedMailDetail(qObj, res, req, rslt));
}

async function getProcessedMailDetail(qObj, res, req, data) {
    // console.log(data, "^^^^^^^^^^^^^^^^^^^^^");

    //inotes 데이터 파싱
    var result;
    if (qObj.type == "mail_followup") {
        result = data;
    } else {
        var jsonString = util.strRight(data, "<readviewentries>");
        jsonString = util.strLeftBack(jsonString, "<unreadinfo>");
        result = JSON.parse(jsonString);
    }
    // console.log(result, "데이터 들어옴");
    // console.log(result);
    if (result.viewentry == null | result.viewentry == "" | result.viewentry == undefined | result.viewentry == [] | result.viewentry == "undefined") {
        result.viewentry = {};
        util.writeSuccess(result.viewentry, res);
        return;
    }
    var obj = {};
    var string = '';
    var result2 = '';
    for (var a = 0; a < result.viewentry.length; a++) {
        // console.log(result.viewentry[a].entrydata);
        obj.unid = result.viewentry[a]['@unid'];
        obj.dockey = qObj.mailPath;
        obj.unread = result.viewentry[a]['@unread'];
        if (obj.unread == 'true') {
            obj.unread = true;
        } else if (obj.unread == 'false') {
            obj.unread = false;
        }
        if (obj.unread == undefined || obj.unread == 'undefined' || obj.unread == '' || obj.unread == null) {
            obj.unread = false;
        }
        if (qObj.type == "mail_attach" || qObj.type === "sent_detail" || qObj.type === "sent_main" || qObj.type === "mail_trash" || qObj.type === "mail_importance") {
            var subject = result.viewentry[a].entrydata[4].text['0'];
            subject = util.strRight(subject, '<span title="');
            subject = util.strLeft(subject, '" infoST=');
            obj.subject = subject;
        } else if (qObj.type == "mail_draft" || qObj.type == "mail_autoSave") {
            var subject = result.viewentry[a].entrydata[2].text['0'];
            subject = util.strRight(subject, 'title=\"');
            subject = util.strLeft(subject, '\" infoST=');
            obj.subject = subject;
        } else if (qObj.searchType == "inbox_detail") {
            obj.subject = result.viewentry[a].entrydata[4].text['0'];
        } else {
            // console.log(result.viewentry[a].entrydata, "여기요 여기!!!");
            // obj.subject = result.viewentry[a].entrydata[5].text['0'];
            obj.subject = result.viewentry[a].entrydata[4].text['0'];
        }

        if (qObj.type == "mail_draft") {
            obj.folderName = "($webdrafts)";
        } else {
            obj.folderName = "0";
        }
        // obj.importance = result.viewentry[a].entrydata[1].number['0'];

        if (qObj.type == "inbox_detail" || qObj.type == "mail_unread" || qObj.type == "search") {

            obj.attach = result.viewentry[a].entrydata[8].number['0'];
            if (obj.attach == "9999") {
                obj.attach = false;
            } else if (obj.attach == "5") {
                obj.attach = true;
            } else if (obj.attach == "0") {
                if (result.viewentry[a].entrydata[7].number['0'] == '9999') {
                    obj.attach = false;
                } else {
                    obj.attach = true;
                }
            } else if (obj.attach == '182' || obj.attach == '179') {
                if (result.viewentry[a].entrydata[7].number['0'] == '9999') {
                    obj.attach = false;
                } else {
                    obj.attach = true;
                }
            }
            obj.created = moment(result.viewentry[a].entrydata[5].datetime['0']).utc().format("YYYYMMDDTHHmmss");

            obj.importance = result.viewentry[a].entrydata[1].number['0'];
            if (obj.importance == "204") {
                obj.importance = true;
            } else {
                obj.importance = false;
            }

            try {
                obj.followup = result.viewentry[a].entrydata[9].number['0'];
                if (obj.followup == "182") {
                    obj.followup = true;
                } else {
                    obj.followup = false;
                }
            } catch (e) {
                if (result.viewentry[a].entrydata[8].number['0'] == "182") {
                    obj.followup = true;
                } else {
                    obj.followup = false;
                }
            }

            obj.sender = result.viewentry[a].entrydata[3].text['0'];

            let isToStuff = false;
            for (let b = 1; b < result.viewentry[a].entrydata.length; b++) {
                if (result.viewentry[a].entrydata[b]['@name'] == '$ToStuff') {
                    isToStuff = true;
                };
            };
            if (isToStuff) {
                if (result.viewentry[a].entrydata[7].text) {
                    obj.tostuff = { "receive": false, "ref": false };
                } else if (result.viewentry[a].entrydata[7].number['0'] == "184") {
                    obj.tostuff = { "receive": true, "ref": false };
                } else {
                    obj.tostuff = { "receive": false, "ref": false };
                }
            } else {
                obj.tostuff = { "receive": false, "ref": false };
            }

            // obj.photo = PA[a]['photo'];

        } else if (qObj.type === "sent_main" || qObj.type === "mail_inner" || qObj.type === "mail_outer" || qObj.type === "mail_notice" || qObj.type === "mail_attach" || qObj.type === "sent_detail" || qObj.type === "mail_trash" || qObj.type === "mail_importance") {
            try {
                var sender = "";
                sender = result.viewentry[a].entrydata[3].text['0'];
                try {
                    sender = JSON.parse(sender);
                    if (qObj.type == "sent_detail") {
                        if (qObj.language == "ko") {
                            sender = sender[0].name["ko"];
                        } else if (qObj.language == "en") {
                            sender = sender[0].name["en"];
                        }
                    } else {
                        if (qObj.language == "ko") {
                            sender = sender.name["ko"];
                        } else if (qObj.language == "en") {
                            sender = sender.name["en"];
                        }
                    }
                    obj.sender = sender;
                    // console.log(sender,"wwwwwwwwwwwwwwwwwwwwww");
                } catch (e) {
                    sender = util.strLeft(sender, '(+');
                    sender = JSON.parse(sender);
                    if (qObj.type == "sent_detail") {
                        if (qObj.language == "ko") {
                            sender = sender[0].name["ko"];
                        } else if (qObj.language == "en") {
                            sender = sender[0].name["en"];
                        }
                    } else {
                        if (qObj.language == "ko") {
                            sender = sender.name["ko"];
                        } else if (qObj.language == "en") {
                            sender = sender.name["en"];
                        }
                    }
                    obj.sender = sender;
                }
            } catch (e) {
                obj.sender = result.viewentry[a].entrydata[3].text['0'];
            }



            // if (sender == undefined | sender == null | sender == '' | sender == 'undefined') {
            //     if (result.viewentry[a].entrydata[3].text['0'].indexOf('\"lastname\":') > -1) {
            //         var resSender = JSON.parse(result.viewentry[a].entrydata[3].text['0']);
            //         obj.sender = resSender[0].lastname['ko'];
            //     } else {
            //         obj.sender = result.viewentry[a].entrydata[3].text['0'];
            //     }
            // } else {
            // }

            obj.attach = result.viewentry[a].entrydata[5].text['0'];
            if (obj.attach == '') {
                obj.attach = false;
            } else {
                obj.attach = true;
            }
            if (qObj.type === "sent_main" || qObj.type === "sent_detail" || qObj.type === "mail_trash" || qObj.type === "mail_importance") {
                obj.created = moment(result.viewentry[a].entrydata[6].datetime['0']).utc().format("YYYYMMDDTHHmmss");
            } else {
                try {
                    obj.created = moment(result.viewentry[a].entrydata[7].datetime['0']).utc().format("YYYYMMDDTHHmmss");
                } catch (error) {
                    obj.created = moment(result.viewentry[a].entrydata[6].datetime['0']).utc().format("YYYYMMDDTHHmmss");

                }
            }
            // console.log(result.viewentry[a].entrydata);
            // console.log('ssssssssssss', result.viewentry[a].entrydata[1].text['0']);
            if (result.viewentry[a].entrydata[1].text['0'].indexOf('vwicn183') > -1) {
                obj.followup = false;
            } else {
                obj.followup = true;
            }

            if (result.viewentry[a].entrydata[2].text['0'].indexOf('importance') > -1) {
                obj.importance = true;
            } else {
                obj.importance = false;
            }

        } else if (qObj.type == "mail_draft" | qObj.type == "mail_autoSave") {
            obj.created = moment(result.viewentry[a].entrydata[4].datetime['0']).utc().format("YYYYMMDDTHHmmss");
        }
        // if (qObj.type == 'mail_autoSave') {
        //     obj.attachinfo = [];
        // } else {
        //     obj.attachinfo = PA[a]['attach'];
        // }

        if (a == (result.viewentry.length - 1)) {
            string += JSON.stringify(obj);
        } else {
            string += JSON.stringify(obj) + ",\n";
        }
    }
    result2 = "[" + string + "]";
    var resObj = {};
    resObj.data = JSON.parse(result2);
    if (qObj.type == "mail_unread") {
        var total = util.strRight(data, "<unreadcount>");
        total = util.strLeft(total, "</unreadcount>");
        resObj.total = total;
    } else {
        resObj.total = result.viewentry[0]['@siblings'];
    }
    if (qObj.type == "sent_main") {
        resObj = JSON.parse(result2);
    }
    util.writeSuccess(resObj, res);
}
//메일함 리스트
async function getMailSearch(qObj, res, req, url) {
    //iNotes URL을 이용하려면 'Referer'를 확인하므로 iNotes Root 페이지를 방문해야 한다.    var referUrl = url;
    referUrl = util.strLeft(url, ".nsf", true);
    axios({
        method: "get",
        url: referUrl,
        httpsAgent: agent,
        headers: {
            "Cookie": qObj.cookie
        },
    }).then(function (response) {
        // console.log(response);
        return null;
    }).then((rslt) => getMailSearch2(qObj, res, req, url));
}
//메일 검색
async function getMailSearch2(qObj, res, req, url) {
    var enPattern = /[a-zA-Z]/; //영어 
    var koPattern = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/; //한글 

    if (enPattern.test(qObj.searchword) && koPattern.test(qObj.searchword)) {
        console.log("hi");
        qObj.searchword = qObj.searchword;
    } else if (enPattern.test(qObj.searchword)) {
        qObj.searchword = "*" + qObj.searchword + "*"
    }
    url = url.replace("#searchword#", qObj.searchword);
    var data = "";
    const formdata = new URLSearchParams();
    //정렬 : resortdescending 날짜 최신순임, 검색 페이지 종류 : folderName
    if (qObj.searchType == "inbox_detail") {
        url = url.replace("#resortdescending#", "5");
        qObj.folderName = "($inbox)";
    } else if (qObj.searchType == "mail_inner") {
        url = url.replace("#resortdescending#", "7");
        qObj.folderName = "($webinbox)_inner";
    } else if (qObj.searchType == "mail_outer") {
        url = url.replace("#resortdescending#", "7");
        qObj.folderName = "($webinbox)_outer";
    } else if (qObj.searchType == "mail_attach") {
        url = url.replace("#resortdescending#", "7");
        qObj.folderName = "($webattachments)";
    } else if (qObj.searchType == "mail_draft") {
        url = url.replace("#resortdescending#", "4");
        qObj.folderName = "($webdrafts)";
    } else if (qObj.searchType == "mail_autoSave") {
        url = url.replace("#resortdescending#", "4");
        qObj.folderName = "autosave4mail";
    } else if (qObj.searchType == "mail_trash") {
        url = url.replace("#resortdescending#", "6");
        qObj.folderName = "($webtrash)";
    } else if (qObj.searchType == "sent_detail") {
        url = url.replace("#resortdescending#", "6");
        qObj.folderName = "($websent)";
    } else if (qObj.searchType == "mail_my") {
        url = url.replace("#resortdescending#", "4");
        qObj.folderName = "($webtome)";
    } else if (qObj.searchType == "mail_followup") {
        url = url.replace("#resortdescending#", "6");
        qObj.folderName = "($follow-up)";
    }

    //예약 메일만 데이터 구조가 다름..
    if (qObj.searchType == "mail_reservation") {
        //([Subject] contains 첨부)
        if (qObj.searchfield == "subject") {
            qObj.searchword = `([Subject] contains ${qObj.searchword})`
        } else if (qObj.searchfield == "sender") {
            qObj.searchword = `([SendTo] contains ${qObj.searchword})`
        }

        var url = config.host + config.mail.search_reservation;
        url = url.replace("#sabun#", qObj.sabun);
        url = url.replace("#size#", qObj.size);
        url = url.replace("#page#", qObj.page);
        url = url.replace("#searchword#", qObj.searchword);
        url = encodeURI(url);
        console.log(url);
        var resultArr = [];
        data = await axios({
            method: "get",
            url: url,
            httpsAgent: agent,
            headers: {
                "Content-Type": "application/json",
                "Cookie": qObj.cookie
            }
        })
            .then((response) => {
                console.log("^^^^^^mail_reservation 메일 검색^^^^^");
                // console.log(response.data);
                return response.data;
            })
            .catch((error) => {
                // throw new Error(error);
                return [];
            });
        // console.log(data, "??????????????");
        for (var dataInx = 0; dataInx < data.length; dataInx++) {
            var resultObj = {};
            resultObj.unid = data[dataInx]["@unid"];
            if (data[dataInx]["$isread"].indexOf("i_hotmail") > -1) {
                resultObj.importance = true;
            } else {
                resultObj.importance = false;
            }
            if (data[dataInx]["$att"] != "") {
                resultObj.attach = true;
            } else {
                resultObj.attach = false;
            }

            resultObj.subject = util.strLeft(data[dataInx]["sj"], "\">");
            resultObj.subject = util.strRight(resultObj.subject, "title=\"");
            resultObj.receiver = util.strRight(data[dataInx]["$94"], ">");
            resultObj.receiver = util.strLeft(resultObj.receiver, "</SPAN>");
            // resultObj.receiver = data[dataInx]["$94"];
            resultObj.reservation_date = moment(data[dataInx]["$190"]).utc().format("YYYYMMDDTHHmmss");
            resultArr[dataInx] = resultObj;
        }
        util.writeSuccess(resultArr, res);
    } else {
        //필터 검색
        if (qObj.searchfield == "") {
            url = url.replace("#searchfield#", "");
        } else if (qObj.searchfield == "subject") {
            qObj.searchword = `(FIELD subject = "${qObj.searchword}" OR FIELD subject_languages = "${qObj.searchword}")`
            url = url.replace("#searchfield#", "subject|subject_languages");
        } else if (qObj.searchfield == "author") {
            qObj.searchword = `(FIELD From = "${qObj.searchword}" OR FIELD Principal = "${qObj.searchword}" OR FIELD authorinfo = "${qObj.searchword}")`
            url = url.replace("#searchfield#", "From|Principal|authorinfo");
        } else if (qObj.searchfield == "sender") {
            qObj.searchword = `(FIELD SendTo = "${qObj.searchword}" OR FIELD ocxsendto = "${qObj.searchword}")`
            url = url.replace("#searchfield#", "SendTo|ocxsendto");
        } else if (qObj.searchfield == "copyto") {
            qObj.searchword = `(FIELD CopyTo = "${qObj.searchword}" OR FIELD ocxcopyto = "${qObj.searchword}")`
            url = url.replace("#searchfield#", "CopyTo|ocxcopyto");
        }

        formdata.append('FolderName', qObj.folderName); //폴더이름
        formdata.append('SearchString', qObj.searchword); //검색어
        formdata.append('UnreadCountInfo', 1);
        formdata.append('SearchSort', "Date");
        formdata.append('hc', "$98");
        formdata.append('noPI', "1");
        formdata.append('%%Nonce', "267C9FD6FA4F81FE0321EC60550BD040");

        url = encodeURI(url);
        console.log(url);
        data = await axios({
            method: "post",
            url: url,
            httpsAgent: agent,
            headers: {
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "Cookie": qObj.cookie,
            },
            data: formdata
        })
            .then((response) => {
                console.log("^^^^^^메일 검색^^^^^");
                // console.log(response.data);
                return response.data;
            })
            .catch((error) => {
                throw new Error(error);
            });
        var result = ""
        // console.log(data);
        if (qObj.type == "mail_followup") {
            result = data
        } else {
            var jsonString = util.strRight(data, "<readviewentries>");
            jsonString = util.strLeftBack(jsonString, "<unreadinfo>");
            result = JSON.parse(jsonString);
        }
        // console.log(result);
        if (result.viewentry == null | result.viewentry == "" | result.viewentry == undefined | result.viewentry == [] | result.viewentry == "undefined") {
            result.viewentry = {};
            util.writeSuccess(result.viewentry, res);
            return;
        }

        var resultArr = [];
        var count = 0;
        var resObj = {};

        //var a = qObj.start - 1; a < qObj.start + qObj.size - 1; a++
        for (var a = qObj.start - 1; a < qObj.start + qObj.size - 1; a++) {
            // console.log(result.viewentry[a]);
            if (result.viewentry.length == a) {
                resObj.data = resultArr;
                resObj.total = result.viewentry.length;
                util.writeSuccess(resObj, res);
                return;
            } else if (result.viewentry.length < a) {
                resObj = {};
                util.writeSuccess(resObj, res);
                return;
            }
            var obj = {};
            obj.unid = result.viewentry[a]['@unid'];
            obj.dockey = qObj.mailPath;
            obj.unread = result.viewentry[a]['@unread'];
            if (obj.unread == 'true') {
                obj.unread = true;
            } else if (obj.unread == 'false') {
                obj.unread = false;
            }
            if (obj.unread == undefined || obj.unread == 'undefined' || obj.unread == '' || obj.unread == null) {
                obj.unread = false;
            }
            if (qObj.searchType == "mail_draft") {
                obj.folderName = "($webdrafts)";
            } else {
                obj.folderName = "0";
            }
            if (qObj.searchType == "mail_attach" || qObj.searchType === "sent_detail" || qObj.searchType === "mail_trash" || qObj.searchType === "mail_importance") {
                var subject = result.viewentry[a].entrydata[4].text['0'];
                subject = util.strRight(subject, '<span title="');
                subject = util.strLeft(subject, '" infoST=');
                obj.subject = subject;
            } else if (qObj.searchType == "mail_draft" || qObj.searchType == "mail_autoSave" || qObj.searchType == "mail_my") {
                var subject = result.viewentry[a].entrydata[2].text['0'];
                subject = util.strRight(subject, 'title=\"');
                subject = util.strLeft(subject, '\" infoST=');
                obj.subject = subject;
            } else if (qObj.searchType == "mail_followup") {
                obj.author = result.viewentry[a].entrydata[3].text['0'];
                obj.subject = result.viewentry[a].entrydata[5].text['0'];
                obj.attach = result.viewentry[a].entrydata[7].number['0'];
                if (obj.attach == "9999") {
                    obj.attach = false;
                } else if (obj.attach == "5") {
                    obj.attach = true;
                }
                obj.created = moment(result.viewentry[a].entrydata[6].datetime['0']).utc().format("YYYYMMDDTHHmmss");
                obj.importance = result.viewentry[a].entrydata[1].number['0'];
                if (obj.importance == "204") {
                    obj.importance = true;
                } else {
                    obj.importance = false;
                }

                obj.followupText = result.viewentry[a].entrydata[8].text['0'];
                // obj.followupDate = moment(result.viewentry[a].entrydata[4].datetime['0']).utc().format("YYYYMMDDTHHmmss");
            } else {
                obj.subject = result.viewentry[a].entrydata[4].text['0'];
            }
            // console.log(obj.subject);
            // obj.importance = result.viewentry[a].entrydata[1].number['0'];

            if (qObj.searchType == "inbox_detail" | qObj.searchType == "mail_unread") {
                try {
                    obj.attach = result.viewentry[a].entrydata[8].number['0'];
                    if (obj.attach == "9999") {
                        obj.attach = false;
                    } else if (obj.attach == "5") {
                        obj.attach = true;
                    } else if (obj.attach == "0") {
                        obj.attach = result.viewentry[a].entrydata[7].number['0'];
                        if (obj.attach == "9999") {
                            obj.attach = false;
                        } else if (obj.attach == "5") {
                            obj.attach = true;
                        }
                    } else if (obj.attach == '182' || obj.attach == '179') {
                        if (result.viewentry[a].entrydata[7].number['0'] == '9999') {
                            obj.attach = false;
                        } else {
                            obj.attach = true;
                        }
                    }

                    obj.created = moment(result.viewentry[a].entrydata[5].datetime['0']).utc().format("YYYYMMDDTHHmmss");

                    obj.importance = result.viewentry[a].entrydata[1].number['0'];
                    if (obj.importance == "204") {
                        obj.importance = true;
                    } else {
                        obj.importance = false;
                    }

                    obj.sender = result.viewentry[a].entrydata[3].text['0'];

                    try {
                        obj.followup = result.viewentry[a].entrydata[9].number['0'];
                        if (obj.followup == "182") {
                            obj.followup = true;
                        } else {
                            obj.followup = false;
                        }
                    } catch (e) {
                        obj.followup = result.viewentry[a].entrydata[8].number['0'];
                        if (obj.followup == "182") {
                            obj.followup = true;
                        } else {
                            obj.followup = false;
                        }
                    }


                    let isToStuff = false;
                    for (let b = 1; b < result.viewentry[a].entrydata.length; b++) {
                        if (result.viewentry[a].entrydata[b]['@name'] == '$ToStuff') {
                            isToStuff = true;
                        };
                    };
                    if (isToStuff) {
                        if (result.viewentry[a].entrydata[7].text) {
                            obj.tostuff = { "receive": false, "ref": false };
                        } else if (result.viewentry[a].entrydata[7].number['0'] == "184") {
                            obj.tostuff = { "receive": true, "ref": false };
                        } else {
                            obj.tostuff = { "receive": false, "ref": false };
                        }
                    } else {
                        obj.tostuff = { "receive": false, "ref": false };
                    }
                    // obj.photo = PA[a]['photo'];
                } catch (e) {
                    // console.log("ssssssssssss", result.viewentry[a].entrydata[7]);
                    // if (result.viewentry[a].entrydata[7].text['0'] == '' | result.viewentry[a].entrydata[7].text['0'] == undefined) {
                    //     obj.tostuff = { "receive": true, "ref": false };
                    // }
                    // obj.tostuff = { "receive": false, "ref": false };
                }
            } else if (qObj.searchType === "mail_inner" | qObj.searchType === "mail_outer" | qObj.searchType === "mail_notice" | qObj.searchType === "mail_attach" | qObj.searchType === "sent_detail" | qObj.searchType === "mail_trash" | qObj.searchType === "mail_importance") {
                var sender = "";
                sender = result.viewentry[a].entrydata[3].text['0'];
                var senderJSON;
                var senderCount = "";

                if (qObj.searchType === "sent_detail") {
                    try {
                        senderJSON = JSON.parse(sender);

                    } catch (e) {
                        if (sender.indexOf("(+") > -1) {
                            try {
                                senderJSON = JSON.parse(util.strLeft(sender, "(+"));
                                senderCount = util.strRightBack(sender, "(", ")");
                            } catch (e) {
                                senderJSON = sender;
                                senderCount = util.strRightBack(sender, "(", ")");
                            }
                        }
                    }
                    try {
                        sender = senderJSON[0]["name"][qObj.language];
                        if (senderCount !== "") {
                            sender += " " + senderCount;
                            obj.sender = sender
                        } else {
                            obj.sender = sender
                        }
                    } catch (e) {
                        if (sender.indexOf('\"lastname\":') > -1) {
                            sender = senderJSON[0].lastname[qObj.language];
                            if (senderCount !== "") {
                                sender += " " + senderCount;
                                obj.sender = sender
                            }
                            obj.sender = sender;
                        } else {
                            sender = result.viewentry[a].entrydata[3].text['0'];
                            if (senderCount !== "") {
                                sender += " " + senderCount;
                                obj.sender = sender
                            }
                            obj.sender = sender;
                        }
                    }

                } else {
                    try {
                        senderJSON = JSON.parse(sender);
                        sender = senderJSON["name"][qObj.language];
                    } catch (e) {

                    }
                    if (sender.indexOf('"') > -1) {
                        sender = sender.substr(1, sender.length - 2);
                    }

                    if (sender == undefined | sender == null | sender == '' | sender == 'undefined') {
                        if (result.viewentry[a].entrydata[3].text['0'].indexOf('\"lastname\":') > -1) {
                            var resSender = JSON.parse(result.viewentry[a].entrydata[3].text['0']);
                            obj.sender = resSender[0].lastname['ko'];
                        } else {
                            obj.sender = result.viewentry[a].entrydata[3].text['0'];
                        }
                    } else {
                        obj.sender = sender
                    }
                }

                obj.attach = result.viewentry[a].entrydata[5].text['0'];
                if (obj.attach == '') {
                    obj.attach = false;
                } else {
                    obj.attach = true;
                }
                if (qObj.searchType === "sent_detail" | qObj.searchType === "mail_trash" | qObj.searchType === "mail_importance") {
                    obj.created = moment(result.viewentry[a].entrydata[6].datetime['0']).utc().format("YYYYMMDDTHHmmss");
                } else {
                    try {
                        obj.created = moment(result.viewentry[a].entrydata[7].datetime['0']).utc().format("YYYYMMDDTHHmmss");
                    } catch (error) {
                        obj.created = moment(result.viewentry[a].entrydata[6].datetime['0']).utc().format("YYYYMMDDTHHmmss");

                    }
                }
                if (result.viewentry[a].entrydata[1].text['0'].indexOf('vwicn183') > -1) {
                    obj.followup = false;
                } else {
                    obj.followup = true;
                }
                if (result.viewentry[a].entrydata[2].text['0'].indexOf('importance') > -1) {
                    obj.importance = true;
                } else {
                    obj.importance = false;
                }

            } else if (qObj.searchType == "mail_draft" | qObj.searchType == "mail_autoSave") {
                obj.created = moment(result.viewentry[a].entrydata[4].datetime['0']).utc().format("YYYYMMDDTHHmmss");
            }
            resultArr[count] = obj;
            count++;

        }

        resObj.data = resultArr;
        resObj.total = result.viewentry.length;

        util.writeSuccess(resObj, res);
    }
}
// 폴더 트리
async function tree(data) {
    console.log("????");
    var tree = [],
        c = {};
    var item, id, parent;

    for (var i = 0; i < data.length; i++) {
        // var item = {};
        // item.name = data[i].nodetitle.ko;
        id = data[i].mycode;
        parent = data[i].parentcode;

        c[id] = c[id] || [];
        data[i]['children'] = c[id];
        if (parent != "") {
            c[parent] = c[parent] || [];

            c[parent].push(data[i]);

        } else {
            // console.log("else",item)
            tree.push(data[i]);
        }
        // console.log(c)
    };

    return tree;
}
// 첨부파일 크기 변환
async function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
//Person 정보
async function getPersonInfo(qObj) {
    var url = `${config.elastic_address[config.version]}/${config.elasticPersonDB}/_search`;

    const id = config.elastic_id + ":" + config.elastic_pw;
    var authorization = Buffer.from(id, "utf8").toString("base64");

    console.log(url);
    var personId = qObj.pInfo.toUpperCase();
    // console.log(personId);
    var query = `{
        "query": {
            "bool": {
                "filter": [
                    {
                        "bool": {
                            "should": [
                                {"term": {"empno": "${personId}"}},
                                {"term": {"_id": "${personId}"}}
                            ]
                        }
                    }
                ]
            }
        }
    }`;

    var result = await axios({
        method: "post",
        url: url,
        data: query,
        headers: {
            Authorization: "Basic " + authorization,
            "Content-Type": "application/json",
        },
    })
        .then((response) => {
            var data = response.data;
            // console.log(data);
            return data["hits"]["hits"][0];

        })
        .catch((error) => {
            throw new Error(error);
        });
    // console.log("ZZZZZZZZZZZZZZZZZ", result);
    //이름 + 직책으로 조합
    var fullName = {};
    try {
        if (qObj.language == "ko") {
            fullName.name = result["_source"].name["ko"] + " " + result["_source"].grade["ko"];
            fullName.shortname = result["_source"].name["ko"]
            fullName.grade = result["_source"].grade["ko"];
            fullName.position = result["_source"].position["ko"];
            fullName.department = result["_source"].departmentname["ko"];
            fullName.company = result["_source"].companyname["ko"];
        } else if (qObj.language == "en") {
            fullName.name = result["_source"].name["en"] + " " + result["_source"].grade["en"];
            fullName.shortname = result["_source"].name["en"]
            fullName.grade = result["_source"].grade["en"];
            fullName.position = result["_source"].position["en"];
            fullName.department = result["_source"].departmentname["en"];
            fullName.company = result["_source"].companyname["en"];
        }
        fullName.id = result["_source"]["@id"];
        return fullName;
    } catch (e) {
        if (qObj.language == "ko") {
            fullName.name = result["_source"].name["ko"];
            fullName.shortname = result["_source"].name["ko"]
            fullName.grade = "";
            fullName.position = "";
            fullName.department = result["_source"].departmentname["ko"];
            fullName.company = result["_source"].companyname["ko"];
        } else if (qObj.language == "en") {
            fullName.name = result["_source"].name["en"];
            fullName.shortname = result["_source"].name["en"]
            fullName.grade = "";
            fullName.position = "";
            fullName.department = result["_source"].departmentname["en"];
            fullName.company = result["_source"].companyname["en"];
        }
        fullName.id = result["_source"]["@id"];
        return fullName;
    }
}
//메일 전송 유저 정보
async function getMailPersonInfo(qObj, name, id) {
    // ex) name = 배선일;박광순;김현담
    try {
        var resultArr = [];
        if (name != "") {
            // console.log("들어옴??????");
            var nameArr = name.split(";");
            var idArr = id.split(";");
            // console.log(nameArr);
            for (var nameInx = 0; nameInx < nameArr.length; nameInx++) {
                var url = config.host + config.mail.userInfo;
                url = url.replace(/#name#/, urlencode(nameArr[nameInx]));
                console.log(url);
                var result = await axios({
                    method: "get",
                    url: url,
                    httpsAgent: agent,
                    headers: {
                        "Content-Type": "application/json",
                        "Cookie": qObj.cookie
                    },
                })
                    .then((response) => {
                        // console.log("****************getMailPersonInfo************");
                        return response.data;
                    })
                    .catch((error) => {
                        throw new Error(error);
                    });
                if (result[0] == null || result[0] == undefined || result[0] == "") {
                    var lastname = nameArr[nameInx].split("@");
                    var outterEmailObj = {
                        "appType": "",
                        "type": "e",
                        "mailaddress": nameArr[nameInx],
                        "languages": "ko,en",
                        "lastname": {
                            "ko": lastname[0],
                            "en": lastname[0]
                        },
                        "jobtitle": "",
                        "companyname": "",
                        "search": `${lastname[0]}<${nameArr[nameInx]}>`
                    }
                    resultArr.push(outterEmailObj);
                } else {
                    for (var i = 0; i < result.length; i++) {
                        try {
                            if (result[i]["type"] == "d") {
                                if (result[i]["mycode"] == idArr[nameInx]) {
                                    resultArr.push(result[i]);
                                    break;
                                }
                            } else if (result[i]["type"] == "u") {
                                if (result[i]["fullname"] === idArr[nameInx]) {
                                    resultArr.push(result[i]);
                                    break;
                                }
                            }
                        } catch (e) {
                            console.log(e);
                        }
                    }
                }
            }
        }

    } catch (e) {
        resultStr = "";
    }

    var resultStr = JSON.stringify(resultArr);
    // console.log(resultStr);
    return resultStr;
}
//메일 내게쓰기 할 때 필요한 정보
async function getMyMailInfo(qObj) {

    var result = await common.getUserInfo(qObj);

    //이름 + 직책으로 조합
    var myInfo = {};
    myInfo.name = result.name[qObj.language] + " " + result.position[qObj.language];
    myInfo.shortname = result.name[qObj.language];
    myInfo.department = result.departmentname[qObj.language];
    myInfo.company = result.companyname[qObj.language];
    myInfo.id = result["@id"];
    myInfo.email = result["email"];
    myInfo.parentcode = result["departmentcode"];
    myInfo.companycode = result["companycode"];
    myInfo.mycode = result["empno"];
    myInfo.kinds = result["@form"];
    myInfo.mobile = result["mobile"];
    myInfo.office = result["office"];


    return myInfo;
}
//조직도 자동완성 검색
async function autoSearch(qObj) {
    var url = `${config.elastic_address[config.version]}/${config.elasticPersonDB}/_search`;
    const id = config.elastic_id + ":" + config.elastic_pw;
    var authorization = Buffer.from(id, "utf8").toString("base64");

    console.log(url);
    var myId = qObj.readers.toUpperCase();
    // console.log(personId);
    var fieldsarr = [
        "name.ko.search^3",
        "departmentname.ko.search",
        "companyname.ko.search",
        "mobile.search",
        "empno.search",
        "email.search",
        "office.search",
        "grade.ko.search",
        "position.ko.search"
    ];

    var must = [];
    var mmatch = {};
    mmatch.operator = "OR";
    mmatch.fields = fieldsarr;
    mmatch.type = "phrase";
    mmatch.query = qObj.keyword;
    var mmmatch = {};
    mmmatch.multi_match = mmatch;

    var match = {
        "match":
            { "@form": "Person" }
    };
    must.push(mmmatch);
    must.push(match);

    var query = {
        "query": {
            "bool": {
                "must": must
            }

        }
    };

    var result = await axios({
        method: "post",
        url: url,
        data: JSON.stringify(query),
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
    // console.log(result);
    //이름 + 직책으로 조합
    var orgArr = [];
    // console.log(result);
    //퇴사자 지우기 (엘라스틱에는 퇴사자 data 남아있음)
    for (var i = 0; i < result.length; i++) {
        if (result[i]["_source"]["@retired"] === 'Y') {
            result.splice(i, 1);
            i--;
        }
    }
    for (var orgInx = 0; orgInx < result.length; orgInx++) {
        var orgObj = {};
        if (result[orgInx]["_source"]["@form"] == "Person") {
            orgObj.id = result[orgInx]["_source"]["@id"];
            var idArr = orgObj.id.split("/");
            if (idArr.length == 3) {
                orgObj.scheduleId = orgObj.id + "@" + idArr[2];
            } else if (idArr.length == 2) {
                orgObj.scheduleId = orgObj.id + "@" + idArr[1];
            }
            orgObj.name = result[orgInx]["_source"]["name"][qObj.language] + " " + result[orgInx]["_source"]["position"][qObj.language];
            orgObj.shortname = result[orgInx]["_source"]["name"][qObj.language];
            orgObj.department = result[orgInx]["_source"]["departmentname"][qObj.language];
            orgObj.company = result[orgInx]["_source"]["companyname"][qObj.language];
            orgObj.email = result[orgInx]["_source"]["email"];
            orgObj.mobile = result[orgInx]["_source"]["mobile"];
            orgObj.office = result[orgInx]["_source"]["office"];
        } else {
            orgObj.name = result[orgInx]["_source"]["name"][qObj.language];
            orgObj.parentname = result[orgInx]["_source"]["departmentname"][qObj.language];

        }
        orgObj.parentcode = result[orgInx]["_source"].departmentcode;
        orgObj.companycode = result[orgInx]["_source"].companycode;
        orgObj.mycode = result[orgInx]["_source"].empno;
        // var photo = config.mail.photo;
        // photo = photo.replace(/#empno#/g, orgObj.mycode);
        var photoUrl = config.photo;
        photoUrl = photoUrl.replace(/#sabun#/g, orgObj.mycode);
        orgObj.photo = photoUrl;
        orgObj.kinds = result[orgInx]["_source"]["@form"];
        orgObj.approvalInfo = result[orgInx]["_source"].approvalInfo;
        orgObj.notesId = result[orgInx]["notesId"];

        orgArr[orgInx] = orgObj;

    }
    return orgArr;
}
//메일 쓰기 양식에 인사말 정보
async function getWriteformGreetings(qObj) {
    //설정된 문서 unid 찾기
    var url = config.host + config.mail.writeFormG;
    url = url.replace("#path#", qObj.mailPath);
    var result = await axios({
        method: "get",
        url: url,
        httpsAgent: agent,
        headers: {
            "Content-Type": "application/json",
            "Cookie": qObj.cookie
        },
    })
        .then((response) => {
            return response.data;
        })
        .catch((error) => {
            throw new Error(error);
        });
    if (result.viewentry == null | result.viewentry == "" | result.viewentry == undefined | result.viewentry == [] | result.viewentry == "undefined") {
        result.viewentry = {};
        return "";
    }
    var unid = "";
    for (var i = 0; i < result.viewentry.length; i++) {
        if (result.viewentry[i].entrydata[1].text['0'].indexOf('vwicn114.gif') > -1) {
            unid = result.viewentry[i]['@unid'];
            // console.log(unid);
        }
    }
    //설정된 문서 body 뽑기
    var url = config.host + config.mail.greetings;
    url = url.replace("#path#", qObj.mailPath);
    url = url.replace("#unid#", unid);
    console.log(url);
    try {
        var greetings = await axios({
            method: "get",
            url: url,
            httpsAgent: agent,
            headers: {
                "Content-Type": "application/json",
                "Cookie": qObj.cookie
            },
        })
            .then((response) => {
                return response.data;
            })
            .catch((error) => {
                throw new Error(error);
            });
    } catch (e) {
        greetings = "";
    }

    return greetings;
}
//메일 쓰기 양식에 서명 정보
async function getWriteformSignature(qObj) {
    //설정된 문서 unid 찾기
    var url = config.host + config.mail.writeFormS;
    url = url.replace("#path#", qObj.mailPath);
    var result = await axios({
        method: "get",
        url: url,
        httpsAgent: agent,
        headers: {
            "Content-Type": "application/json",
            "Cookie": qObj.cookie
        },
    })
        .then((response) => {
            return response.data;
        })
        .catch((error) => {
            throw new Error(error);
        });
    if (result.viewentry == null | result.viewentry == "" | result.viewentry == undefined | result.viewentry == [] | result.viewentry == "undefined") {
        result.viewentry = {};
        return "";
    }
    var unid = "";
    for (var i = 0; i < result.viewentry.length; i++) {
        if (result.viewentry[i].entrydata[1].text['0'].indexOf('vwicn114.gif') > -1) {
            unid = result.viewentry[i]['@unid'];
            console.log(unid);
        }
    }
    //설정된 문서 body 뽑기
    var url = config.host + config.mail.signature;
    url = url.replace("#path#", qObj.mailPath);
    url = url.replace("#unid#", unid);
    console.log(url);
    try {
        var signature = await axios({
            method: "get",
            url: url,
            httpsAgent: agent,
            headers: {
                "Content-Type": "application/json",
                "Cookie": qObj.cookie
            },
        })
            .then((response) => {
                return response.data;
            })
            .catch((error) => {
                throw new Error(error);
            });
    } catch (e) {
        signature = "";
    }

    return signature;
}
//서명, 인사말 리스트
async function getGreetingsSignature(qObj, res, req, url) {
    var url = qObj.url;
    var result = await axios({
        method: "get",
        url: url,
        httpsAgent: agent,
        headers: {
            "Content-Type": "application/json",
            "Cookie": qObj.cookie
        },
    })
        .then((response) => {
            return response.data;
        })
        .catch((error) => {
            throw new Error(error);
        });
    if (result.viewentry == null | result.viewentry == "" | result.viewentry == undefined | result.viewentry == [] | result.viewentry == "undefined") {
        result.viewentry = {};
        util.writeSuccess(result.viewentry, res);
        return;
    }
    var resArr = [];
    var use = false;
    for (var i = 0; i < result.viewentry.length; i++) {
        var resObj = {};
        resObj.unid = result.viewentry[i]['@unid'];
        if (result.viewentry[i].entrydata[1].text['0'].indexOf('vwicn114.gif') > -1) {
            resObj.default = true;
            use = true;
        } else {
            resObj.default = false;
        }
        resObj.subject = result.viewentry[i].entrydata[2].text['0'];
        resArr[i] = resObj;
    }
    var r = {};
    r.data = resArr;
    r.use = use;


    return r;
}
//첨부 다운로드 정보 보내주기(사용안함)
async function attachInfoSend(qObj, res) {
    var url = "http://swg60.saerom.co.kr/mail/209003.nsf/IMAPInbox/9AE1ED9E6B79881F49258728001A7B94/$FILE/모바일적응형휍-PMC-02(WBS)-V0.2_2021.08.03_웹개발.xlsx";
    url = encodeURI(url);
    var result = await axios({
        method: "get",
        url: url,
        headers: {
            "Cookie": qObj.cookie
        },
    })
        .then((response) => {
            return response.file;
        })
        .catch((error) => {
            throw new Error(error);
        });
    // util.writeSuccess(result, res); qObj.file[attachInx].buffer
    // console.log(result, "sssssssssss");
    res.send(result);
    // console.log(result);
}
//선택 삭제 (완전 삭제)
async function deleteSchedule(qObj, res, req, url) {

    await axios({
        method: "post",
        url: url,
        httpsAgent: agent,
        headers: {
            "Content-Type": "application/json",
            "Cookie": qObj.cookie
        },
        data: req.body.unid
    }).then((response) => {

        // console.log(response);
        util.writeSuccess('Done', res);
        return;
    });
}

//상세보기
// async function getDetail(qObj, res, req, url) {
//     if (qObj.mailType == "mail_reservation") {
//         url = config.host + config.mail.dasresMail;
//         url = url.replace("#unid#", qObj.unid);
//     }
//     console.log(url);

//     var data = await axios({
//         method: "get",
//         url: url,
//         httpsAgent: agent,
//         headers: {
//             "Content-Type": "application/json",
//             "Cookie": qObj.cookie
//         },
//     })
//         .then((response) => {

//             return response.data;
//         })
//         .catch((error) => {
//             throw new Error(error);
//         });
//     // console.log(data);
//     var resultObj = {};
//     resultObj.subject = data.Subject;
//     resultObj.authorEmail = data.MailAddress;
//     var authorInfoObj = {};
//     try {
//         if (data.authorInfo == undefined) {
//             authorInfoObj.name = common.languageConverter(data.authordispinfo_lang, qObj.language, ",", ":");
//             authorInfoObj.shortname = common.languageConverter(data.authorname, qObj.language, ",", ":");
//             authorInfoObj.grade = common.languageConverter(data.authorgradename, qObj.language, ",", ":");
//             authorInfoObj.position = common.languageConverter(data.authordutyname, qObj.language, ",", ":");
//             authorInfoObj.department = common.languageConverter(data.authororgname, qObj.language, ",", ":");
//             authorInfoObj.company = common.languageConverter(data.authorcomname, qObj.language, ",", ":");
//             authorInfoObj.id = data.From;
//         } else {
//             var authorInfoJSON = JSON.parse(data.authorInfo);
//             authorInfoObj.name = authorInfoJSON["displayAll"][qObj.language];
//             authorInfoObj.shortname = authorInfoJSON["name"][qObj.language];
//             authorInfoObj.grade = authorInfoJSON["jobtitle_display"][qObj.language];
//             authorInfoObj.position = authorInfoJSON["position1"][qObj.language];
//             authorInfoObj.department = authorInfoJSON["dept1_shortname"][qObj.language];
//             authorInfoObj.company = authorInfoJSON["company"][qObj.language];
//             authorInfoObj.id = authorInfoJSON["fullname"];
//         }
//     } catch (e) {
//         authorInfoObj.name = data["X_Original_MAILFROM"];
//         authorInfoObj.shortname = data["X_Original_MAILFROM"];
//         authorInfoObj.grade = data["X_Original_MAILFROM"];
//         authorInfoObj.position = data["X_Original_MAILFROM"];
//         authorInfoObj.department = data["X_Original_MAILFROM"];
//         authorInfoObj.company = data["X_Original_MAILFROM"];
//         authorInfoObj.id = data["X_Original_MAILFROM"];
//     }
//     resultObj.author = authorInfoObj;
//     var textSendTo;
//     var sendToArr = [];

//     try {
//         textSendTo = data.ocxSendTo.data.replace(/&quot;/g, '"');
//         textSendTo = textSendTo.replace('<font size="2">', "");
//         textSendTo = textSendTo.replace('</font>', "");

//         var sendToJSON = JSON.parse(textSendTo);
//         // console.log(sendToJSON);
//         for (var i = 0; i < sendToJSON.length; i++) {
//             var sendToObj = {};
//             if (sendToJSON[i]["type"] == "d") {
//                 sendToObj.name = sendToJSON[i]["name"][qObj.language];
//             } else if (sendToJSON[i]["type"] == "e") {
//                 sendToObj.name = sendToJSON[i]["lastname"][qObj.language];
//             } else {
//                 sendToObj.name = sendToJSON[i]["name"][qObj.language] + " " + sendToJSON[i]["jobtitle_display"][qObj.language];
//                 sendToObj.grade = sendToJSON[i]["jobtitle_display"][qObj.language];
//                 sendToObj.shortname = sendToJSON[i]["name"][qObj.language];
//                 sendToObj.department = sendToJSON[i]["dept1_shortname"][qObj.language];
//                 sendToObj.company = sendToJSON[i]["company"][qObj.language];
//                 sendToObj.id = sendToJSON[i]["fullname"];
//             }
//             sendToArr.push(sendToObj);
//         }
//     } catch (e) {
//         try {
//             textSendTo = data.SendToFull;

//             var sendToObj = {};
//             var sendInfoArr = textSendTo.split("^");
//             sendToObj.name = common.languageConverter(sendInfoArr[1], qObj.language, ",", ":");
//             sendToObj.grade = common.languageConverter(sendInfoArr[6], qObj.language, ",", ":");
//             sendToObj.shortname = common.languageConverter(sendInfoArr[1], qObj.language, ",", ":");
//             sendToObj.department = common.languageConverter(sendInfoArr[11], qObj.language, ",", ":");
//             sendToObj.company = common.languageConverter(sendInfoArr[12], qObj.language, ",", ":");
//             sendToObj.id = common.languageConverter(sendInfoArr[3], qObj.language, ",", ":");

//             sendToArr.push(sendToObj);
//         } catch (e) {
//             // console.log(typeof data.SendTo);
//             if (typeof data.SendTo == "string") {
//                 sendToObj.name = data.SendTo;
//                 sendToObj.grade = data.SendTo;
//                 sendToObj.shortname = data.SendTo;
//                 sendToObj.department = data.SendTo;
//                 sendToObj.company = data.SendTo;
//                 sendToObj.id = data.SendTo;
//                 sendToArr.push(sendToObj);
//             } else {
//                 var sendToData = data.SendTo;
//                 // console.log(sendToData.length);
//                 for (var x = 0; x < sendToData.length; x++) {
//                     var sendToObj = {};
//                     sendToObj.name = sendToData[x];
//                     sendToObj.grade = sendToData[x];
//                     sendToObj.shortname = sendToData[x];
//                     sendToObj.department = sendToData[x];
//                     sendToObj.company = sendToData[x];
//                     sendToObj.id = sendToData[x];
//                     sendToArr.push(sendToObj);
//                 }
//             }

//         }
//     }
//     resultObj.sendTo = sendToArr;

//     var textCopyTo;
//     try {
//         textCopyTo = data.ocxCopyTo.data.replace(/&quot;/g, '"');
//         textCopyTo = textCopyTo.replace('<font size="2">', "");
//         textCopyTo = textCopyTo.replace('</font>', "");
//     } catch (e) {
//         textCopyTo = "[]"
//     }
//     var copyToJSON = JSON.parse(textCopyTo);
//     // console.log(copyToJSON);
//     var copyToArr = [];
//     for (var i = 0; i < copyToJSON.length; i++) {
//         var copyToObj = {};
//         if (copyToJSON[i]["type"] == "d") {
//             copyToObj.name = copyToJSON[i]["name"][qObj.language];
//         } else if (copyToJSON[i]["type"] == "e") {
//             copyToObj.name = copyToJSON[i]["lastname"][qObj.language];
//         } else {
//             copyToObj.name = copyToJSON[i]["name"][qObj.language] + " " + copyToJSON[i]["jobtitle_display"][qObj.language];
//             copyToObj.grade = copyToJSON[i]["jobtitle_display"][qObj.language];
//             copyToObj.shortname = copyToJSON[i]["name"][qObj.language];
//             copyToObj.department = copyToJSON[i]["dept1_shortname"][qObj.language];
//             copyToObj.company = copyToJSON[i]["company"][qObj.language];
//             copyToObj.id = copyToJSON[i]["fullname"];
//         }
//         copyToArr.push(copyToObj);
//     }
//     resultObj.copyTo = copyToArr;

//     var textBcopyTo;
//     try {
//         textBcopyTo = data.ocxBCopyTo.data.replace(/&quot;/g, '"');
//         textBcopyTo = textBcopyTo.replace('<font size="2">', "");
//         textBcopyTo = textBcopyTo.replace('</font>', "");
//     } catch (e) {
//         textBcopyTo = "[]"
//     }
//     var bCopyToJSON = JSON.parse(textBcopyTo);
//     // console.log(bCopyToJSON);
//     var bCopyToArr = [];
//     for (var i = 0; i < bCopyToJSON.length; i++) {
//         var bCopyToObj = {};
//         if (bCopyToJSON[i]["type"] == "d") {
//             bCopyToObj.name = bCopyToJSON[i]["name"][qObj.language];
//         } else if (bCopyToJSON[i]["type"] == "e") {
//             bCopyToObj.name = bCopyToJSON[i]["lastname"][qObj.language];
//         } else {
//             bCopyToObj.name = bCopyToJSON[i]["name"][qObj.language] + " " + bCopyToJSON[i]["jobtitle_display"][qObj.language];
//             bCopyToObj.grade = bCopyToJSON[i]["jobtitle_display"][qObj.language];
//             bCopyToObj.shortname = bCopyToJSON[i]["name"][qObj.language];
//             bCopyToObj.department = bCopyToJSON[i]["dept1_shortname"][qObj.language];
//             bCopyToObj.company = bCopyToJSON[i]["company"][qObj.language];
//             bCopyToObj.id = bCopyToJSON[i]["fullname"];
//         }
//         bCopyToArr.push(bCopyToObj);
//     }
//     resultObj.blindCopyTo = bCopyToArr;

//     if (qObj.mailType !== "mail_reservation") {
//         var replyMail = await reMail(qObj, res, req);
//         var forwardMail = await fwMail(qObj, res, req);
//         resultObj.replyMail = replyMail
//         resultObj.forwardMail = forwardMail
//     }
//     //https://gw.krb.co.kr/mail3/202111011.nsf/0/9C3999637039FECC492587EA001D5C66/Body?Openfield
//     var bodyUrl = "";
//     if (qObj.mailType == "mail_reservation") {
//         bodyUrl = config.appServer + config.mail.resMailBody;
//         bodyUrl = bodyUrl.replace(/#unid#/, qObj.unid);
//     } else {
//         // console.log(req);
//         bodyUrl = config.appServer + config.mail.detailBody;
//         bodyUrl = bodyUrl.replace(/#path#/, qObj.mailPath);
//         bodyUrl = bodyUrl.replace(/#unid#/, qObj.unid);
//     }
//     // console.log(data);
//     // var attachDataArr;
//     // try {
//     //     attachDataArr = data["Body"]["attachments"];
//     //     if (attachDataArr == undefined) {
//     //         attachDataArr = [];
//     //     }
//     // } catch (e) {
//     //     attachDataArr = [];
//     // }
//     // var attachArr = [];
//     // console.log(attachDataArr, "???????????????????????????");
//     // for (var attachIdx = 0; attachIdx < attachDataArr.length; attachIdx++) {
//     //     var attachObj = {};
//     //     var attachName = util.strRight(attachDataArr[attachIdx]["@href"], "/Body/M2/");
//     //     if (attachDataArr[attachIdx]["@href"].indexOf("?OpenElement") > -1) {
//     //         attachName = util.strLeft(attachName, "?OpenElement");
//     //         attachObj.name = urlencode(attachName);
//     //         attachObj.url = attachDataArr[attachIdx]["@href"];
//     //         attachObj.size = ""
//     //         attachArr.push(attachObj);
//     //     }
//     // }
//     resultObj.attach = await getAttachInfo(qObj, res, req, url);
//     resultObj.body = bodyUrl;
//     await readFlag(qObj, res, req, url);

//     util.writeSuccess(resultObj, res);
// }

async function getAttachInfo(qObj, res, req, url) {
    // /mail/Z99999.nsf/$attachments/F9D3EE3C2E23A51B325AA027CD956B2D??opendocument
    console.log(config.host + `/${qObj.mailPath}/$attachments/${qObj.unid}?opendocument`);
    var result = await axios({
        method: "get",
        url: config.host + `/${qObj.mailPath}/$attachments/${qObj.unid}?opendocument`,
        httpsAgent: agent,
        headers: {
            "Content-Type": "application/json",
            "Cookie": qObj.cookie
        },
    }).then((response) => {
        return response.data;
    }).catch((e) => {
        console.log(e);
    });
    // console.log(result,"??????????????????????");
    return result;
}

//상세보기
async function getDetail(qObj, res, req, url) {
    if (qObj.mailType == "mail_reservation") {
        url = config.host + config.mail.resMail;
        url = url.replace("#unid#", qObj.unid);
    }
    console.log(url);
    var data = await axios({
        method: "get",
        url: url,
        httpsAgent: agent,
        headers: {
            "Content-Type": "application/json",
            "Cookie": qObj.cookie
        },
    })
        .then((response) => {

            return response.data;
        })
        .catch((error) => {
            throw new Error(error);
        });
    // console.log(data);
    console.log("**************** detail *******************");
    const $ = cheerio.load(data);
    var resultObj = {};
    if (data.includes('var FORM_NAME = "NonDelivery Report"')) {
        var author = { name: '' };
        var attach = [];
        resultObj.created = moment($('input[name=tmpDisplayDate_Preview]').val()).utc().format("YYYYMMDDTHHmmss");
        resultObj.author = author;
        resultObj.attach = attach;
        resultObj.subject = 'Delivery Failure Report';
        resultObj.body = `/${qObj.mailPath}/($Inbox)/${qObj.unid}?OpenDocument&rowid=${qObj.unid}&ui=webmail&ui=webmail`
        resultObj.bodyurl = true
        util.writeSuccess(resultObj, res);
        return;
    }
    var authorInfo = data.match(/var authorinfo = (.*);/);
    try {
        authorInfo = JSON.parse(authorInfo[1].substr(1, authorInfo[1].length - 2));
    } catch (error) {
        authorInfo = data.match(/var authorinfo = (.*)'/);
        authorInfo = JSON.parse(authorInfo[1].substr(1, authorInfo[1].length - 1));
    }

    var authorInfo2 = data.match(/var CURRENT_USER_INFO = (.*);/);
    try {
        authorInfo2 = JSON.parse(authorInfo2[1].substr(1, authorInfo2[1].length - 2));
    } catch (error) {
        authorInfo2 = data.match(/var CURRENT_USER_INFO = (.*)'/);
        authorInfo2 = JSON.parse(authorInfo2[1].substr(1, authorInfo2[1].length - 1));
    }

    var created = data.match(/var sendMailDate_srv = (.*);/);
    try {
        created = created[1].substr(1, created[1].length - 2);
    } catch (error) {
        created = "";
    }

    var data2 = data.replace(/(\s*)/g, "");
    var folderName = util.strRight(data2, 'varfoldername="');
    folderName = util.strLeft(folderName, '";')
    resultObj.folderName = folderName;
    resultObj.created = moment(created).utc().format("YYYYMMDDTHHmmss");
    resultObj.subject = $('#DisSubject').text();

    var authorObj = {};
    try {
        if (authorInfo["type"] == "e") {
            var data2 = data.replace(/(\s*)/g, "");
            var authorEmail = util.strRight(data2, 'SMTPOriginator="');
            authorEmail = util.strLeft(authorEmail, '"');
            if (authorEmail == undefined || authorEmail == "undefined" || authorEmail == null || authorEmail == "") {
                // <> 안에 email 표시
                var authorEmail2 = util.strRight(data2, 'from="');
                var removeName = util.strRight(authorEmail2, '<');
                authorEmail = util.strLeft(removeName, '>');
            }

            //authorInfo["lastname"][qObj.language]+" <"+authorEmail+">"
            authorObj.name = authorInfo["lastname"][qObj.language] + " <" + authorEmail + ">";
            authorObj.shortname = authorEmail;
            authorObj.grade = authorEmail;
            authorObj.position = authorEmail;
            authorObj.department = authorEmail;
            authorObj.company = authorEmail;
            authorObj.id = authorEmail;
            resultObj.authorEmail = authorEmail;
        } else {
            authorObj.name = authorInfo["displayAll"][qObj.language];
            authorObj.shortname = authorInfo["name"][qObj.language];
            authorObj.grade = authorInfo["grade1"][qObj.language];
            authorObj.position = authorInfo["position1"][qObj.language];
            authorObj.department = authorInfo["dept1_shortname"][qObj.language];
            authorObj.company = authorInfo["company"][qObj.language];
            authorObj.id = authorInfo["fullname"];
            resultObj.authorEmail = authorInfo["mailaddress"];
        }
        resultObj.author = authorObj;
    } catch (e) {
        authorObj.name = authorInfo2["displayAll"][qObj.language];
        authorObj.shortname = authorInfo2["name"][qObj.language];
        authorObj.grade = authorInfo2["grade1"][qObj.language];
        authorObj.position = authorInfo2["position1"][qObj.language];
        authorObj.department = authorInfo2["dept1_shortname"][qObj.language];
        authorObj.company = authorInfo2["company"][qObj.language];
        authorObj.id = authorInfo2["fullname"];
        resultObj.authorEmail = authorInfo2["mailaddress"];
        resultObj.author = authorObj;

    }

    try {
        var sendTo;
        if ($('#ocxSendTo').text() == "") {
            sendTo = [];
        } else {
            sendTo = JSON.parse($('#ocxSendTo').text());
        }
        // var sendTo = JSON.parse($('#ocxSendTo').text()); //구분자 : 
        // console.log(sendTo);
        var sendToArr = [];
        for (var sendToIdx = 0; sendToIdx < sendTo.length; sendToIdx++) {
            var sendToObj = {};
            var item = sendTo[sendToIdx];
            if (item["type"] == "u") {
                if (item["title1"] == null) {
                    sendToObj.name = item["name"][qObj.language] + " " + item["jobtitle_display"][qObj.language];
                    sendToObj.grade = item["jobtitle_display"][qObj.language];
                } else {
                    sendToObj.name = item["name"][qObj.language] + " " + item["title1"][qObj.language];
                    sendToObj.grade = item["title1"][qObj.language];
                }
                sendToObj.shortname = item["name"][qObj.language];
                sendToObj.department = item["dept1_shortname"][qObj.language];
                try {
                    sendToObj.company = item["company"][qObj.language];
                } catch (error) {
                    sendToObj.company = undefined;
                }
                sendToObj.id = item["fullname"];
            } else if (item["type"] == "d") {
                sendToObj.name = item["name"][qObj.language]
                sendToObj.id = item["name"][qObj.language]
                sendToObj.email = item["name"][qObj.language]
            } else if (item["type"] == "e") {
                sendToObj.name = item["lastname"][qObj.language];
                sendToObj.email = item["mailaddress"];
                sendToObj.id = item["mailaddress"];
            }

            sendToArr[sendToIdx] = sendToObj;

        }
    } catch (e) {
        console.log(e);
        var sendToArr = [];
        var sendTo = JSON.parse($('#ocxSendTo').text()); //구분자 : 
        for (var sendToIdx = 0; sendToIdx < sendTo.length; sendToIdx++) {
            var sendToObj = {};
            var item = sendTo[sendToIdx];
            sendToObj.name = item["name"][qObj.language] || item["lastname"][qObj.language];
            sendToArr[sendToIdx] = sendToObj;
        }
    }
    resultObj.sendTo = sendToArr;

    try {
        var copyTo;
        if ($('#ocxCopyTo').text() == "") {
            copyTo = [];
        } else {
            copyTo = JSON.parse($('#ocxCopyTo').text()); //구분자 : 
        }
        // console.log(copyTo)
        // var copyTo = JSON.parse($('#ocxCopyTo').text()); //구분자 : 
        // console.log(sendTo);
        var copyToArr = [];
        for (var copyToIdx = 0; copyToIdx < copyTo.length; copyToIdx++) {
            var copyToObj = {};
            var item = copyTo[copyToIdx];
            if (item["type"] == "u") {
                if (item["title1"] == null) {
                    copyToObj.name = item["name"][qObj.language] + " " + item["jobtitle_display"][qObj.language];
                    copyToObj.grade = item["jobtitle_display"][qObj.language];
                } else {
                    copyToObj.name = item["name"][qObj.language] + " " + item["title1"][qObj.language];
                    copyToObj.grade = item["title1"][qObj.language];
                }

                // copyToObj.name = item["name"][qObj.language] + " " + item["title1"][qObj.language];
                copyToObj.shortname = item["name"][qObj.language];
                // copyToObj.grade = item["title1"][qObj.language];
                copyToObj.department = item["dept1_shortname"][qObj.language];
                copyToObj.company = item["company"][qObj.language];
                copyToObj.id = item["fullname"];
            } else if (item["type"] == "d") {
                copyToObj.name = item["name"][qObj.language];
                copyToObj.email = item["name"][qObj.language];
                copyToObj.id = item["name"][qObj.language];
            } else if (item["type"] == "e") {
                copyToObj.name = item["lastname"][qObj.language];
                copyToObj.email = item["mailaddress"];
                copyToObj.id = item["mailaddress"];

            }

            copyToArr[copyToIdx] = copyToObj;
        }
    } catch (e) {
        var copyToArr = [];
        var copyTo = JSON.parse($('#ocxCopyTo').text()); //구분자 : 
        for (var copyToIdx = 0; copyToIdx < copyTo.length; copyToIdx++) {
            var copyToObj = {};
            var item = copyTo[copyToIdx];
            if (item.name) {
                copyToObj.name = item.name[qObj.language];
            } else {
                copyToObj.name = item.lastname[qObj.language];
            }
            copyToArr[copyToIdx] = copyToObj;
        }

    }
    resultObj.copyTo = copyToArr;

    try {
        var bcopyTo;
        if ($('#ocxBCopyTo').text() == "") {
            bcopyTo = [];
        } else {
            bcopyTo = JSON.parse($('#ocxBCopyTo').text()); //구분자 : 
        }
        // console.log(bcopyTo,";;;;;;;;;;;;;;;;;;;");
        var bcopyToArr = [];
        for (var bcopyToIdx = 0; bcopyToIdx < bcopyTo.length; bcopyToIdx++) {
            var bcopyToObj = {};
            var item = bcopyTo[bcopyToIdx];
            if (item["type"] == "u") {
                bcopyToObj.name = item["name"][qObj.language] + " " + item["title1"][qObj.language];
                bcopyToObj.shortname = item["name"][qObj.language];
                bcopyToObj.grade = item["title1"][qObj.language];
                bcopyToObj.department = item["dept1_shortname"][qObj.language];
                bcopyToObj.company = item["company"][qObj.language];
                bcopyToObj.id = item["fullname"];
            } else if (item["type"] == "d") {
                bcopyToObj.name = item["name"];
                bcopyToObj.email = item["name"];
                bcopyToObj.id = item["name"];
            } else if (item["type"] == "e") {
                bcopyToObj.name = item["lastname"][qObj.language];
                bcopyToObj.email = item["mailaddress"];
                bcopyToObj.id = item["mailaddress"];
            }

            bcopyToArr[bcopyToIdx] = bcopyToObj;
        }
    } catch (e) {
        // console.log(e);
        var bcopyToArr = [];
        var bcopyTo = JSON.parse($('#ocxBCopyTo').text()); //구분자 : 
        for (var bcopyToIdx = 0; bcopyToIdx < bcopyTo.length; bcopyToIdx++) {
            var bcopyToObj = {};
            var item = bcopyTo[bcopyToIdx];
            bcopyToObj.name = item["name"][qObj.language] || item["lastname"][qObj.language];
            bcopyToArr[bcopyToIdx] = bcopyToObj;
        }
    }
    resultObj.blindCopyTo = bcopyToArr;

    var attachInfo = [];
    var attachName = $('#filename').val().split(""); //구분자 : 
    if (attachName != "") {
        var attachSize = $('#filesize').val().split(""); //구분자 : 
        var attachUrl = $('#fileurl_scrap').val().split(""); //구분자 : 
        // console.log(attachUrl,"?????");
        for (var attachIdx = 0; attachIdx < attachName.length; attachIdx++) {
            var attachObj = {};
            attachObj.name = attachName[attachIdx];
            attachObj.size = common.formatBytes(attachSize[attachIdx], 2);
            // console.log(util.strRight(attachUrl[attachIdx], config.mailUrl),";;;;;;;;;;;;;;;;;;;;;;;",config.mailUrl);
            attachObj.url = util.strRight(attachUrl[attachIdx], config.mailUrl);
            attachInfo[attachIdx] = attachObj;
        }
    }
    if (qObj.mailType !== "mail_reservation") {
        var replyMail = await reMail(qObj, res, req);
        var forwardMail = await fwMail(qObj, res, req);
        resultObj.replyMail = replyMail
        resultObj.forwardMail = forwardMail
    }
    resultObj.attach = attachInfo;
    // var bodyUrl = "";
    // if (qObj.mailType == "mail_reservation") {
    //     bodyUrl = config.appServer + config.mail.resMailBody;
    //     bodyUrl = bodyUrl.replace(/#unid#/, qObj.unid);
    // } else {
    //     // console.log(req);
    //     bodyUrl = config.appServer + config.mail.detailBody;
    //     bodyUrl = bodyUrl.replace(/#path#/, qObj.mailPath);
    //     bodyUrl = bodyUrl.replace(/#unid#/, qObj.unid);
    // }
    // resultObj.body = await mailDetailBody(qObj);

    if (config.bodyurl) {
        var url = "";
        if (qObj.mailType == "mail_reservation") {
            url = config.mail.resMailBody;
            url = url.replace(/#unid#/, qObj.unid);
        } else {

            url = config.mail.detailBody;
            url = url.replace(/#path#/, qObj.mailPath);
            url = url.replace(/#unid#/, qObj.unid);
        }
        resultObj.body = url;
    } else {
        resultObj.body = await mailDetailBody(qObj);
    }
    resultObj.bodyurl = config.bodyurl;

    // resultObj.body = bodyUrl;
    await readFlag(qObj, res, req, url);
    util.writeSuccess(resultObj, res);
}
//상세보기 body
async function mailDetailBody(qObj) {

    if (qObj.mailType == "mail_reservation") {
        var url = config.host + config.mail.resMailBody;
        url = url.replace(/#unid#/, qObj.unid);
    } else {
        var url = config.host + config.mail.detailBody;
        url = url.replace(/#path#/, qObj.mailPath);
        url = url.replace(/#unid#/, qObj.unid);
    }
    console.log(url, "???????????????");
    var result = await axios({
        method: "get",
        url: url,
        httpsAgent: agent,
        headers: {
            "Content-Type": "application/json",
            "Cookie": qObj.cookie
        },
    })
        .then((response) => {
            console.log("****************detail BODY************");
            return response.data;
        })
        .catch((error) => {
            throw new Error(error);
        });
    if (result.indexOf('<table border="1" cellspacing="2" cellpadding="4">') > -1) {
        result = util.strLeft(result, '<table border="1" cellspacing="2" cellpadding="4">');
        // return common.urlConverter(result, qObj);
        return result;
    } else {
        // return common.urlConverter(result, qObj);
        return result;
    }
}
//사용안함
function getMailDockey(qObj, res, req, url) {
    var url = config.host + config.mail.getMailDockey;
    url = url.replace("#path#", qObj.mailPath);
    axios({
        method: "get",
        url: url,
        httpsAgent: agent,
        headers: {
            "Content-Type": "application/json",
            "Cookie": qObj.cookie
        },
    })
        .then((response) => {
            const $ = cheerio.load(response.data);
            var dockeyArr = $("#autosave4mail").attr("src").split("&");
            var dockey = ""
            for (var i = 0; i < dockeyArr.length; i++) {
                if (dockeyArr[i].indexOf("dockey") > -1) {
                    dockey = util.strRight(dockeyArr[i], "=");
                }
            }
            util.writeSuccess(dockey, res);
            return;
        })
        .catch((error) => {
            throw new Error(error);
        });
}
//읽음 표시
function readFlag(qObj, res, req, url) {
    console.log("*******************readflag************************");
    // console.log(qObj);
    url = config.host + config.mail.readflag;
    url = url.replace(/#path#/, qObj.mailPath);
    url = url.replace(/#unid#/, qObj.unid);
    console.log(url);
    axios({
        method: "get",
        url: url,
        httpsAgent: agent,
        headers: {
            "Content-Type": "application/json",
            "Cookie": qObj.cookie
        },
    })
        .then((response) => {
            if (response.status == 200) {
                console.log("메일 읽음 처리 완료");
            }
        })
        .catch((error) => {
            throw new Error(error);
        });
    return;
}
//답장할때 필요한 데이터
async function reMail(qObj, res, req) {
    var url = config.host + config.mail.reMailUrl;
    url = url.replace(/#unid#/g, qObj.unid);
    url = url.replace("#path#", qObj.mailPath);
    var data = await axios({
        method: "get",
        url: url,
        httpsAgent: agent,
        headers: {
            "Content-Type": "application/json",
            "Cookie": qObj.cookie
        },
    })
        .then((response) => {

            return response.data;
        })
        .catch((error) => {
            throw new Error(error);
        });
    var resultObj = {};
    const $ = cheerio.load(data);
    var subject = $("input[name='Subject']").val()
    var orgSubject = $("input[name='previous_subject']").val()
    var orgFrom = $("input[name='previous_from']").val()
    var orgDate = $("input[name='previous_date']").val()
    var orgTo = $("input[name='previous_to']").val()
    var orgCc = $("input[name='previous_cc']").val()
    var body = `----- 원본 메시지 -----<br>제목: ${orgSubject}<br>발신: ${orgFrom} (${orgDate})<br>`
    if (orgTo !== "") {
        body = body + `수신: ${orgTo}`
    }
    if (orgCc !== "") {
        body = body + `<br>참조: ${orgCc}<br><br>`
    }

    resultObj.subject = subject;
    resultObj.body = body;

    return resultObj;
}
//전달할때 필요한 데이터
async function fwMail(qObj, res, req) {
    var url = config.host + config.mail.fwMailUrl;
    url = url.replace(/#unid#/g, qObj.unid);
    url = url.replace("#path#", qObj.mailPath);
    var data = await axios({
        method: "get",
        url: url,
        httpsAgent: agent,
        headers: {
            "Content-Type": "application/json",
            "Cookie": qObj.cookie
        },
    })
        .then((response) => {

            return response.data;
        })
        .catch((error) => {
            throw new Error(error);
        });
    var resultObj = {};
    const $ = cheerio.load(data);
    var subject = $("input[name='Subject']").val()
    var orgSubject = $("input[name='previous_subject']").val()
    var orgFrom = $("input[name='previous_from']").val()
    var orgDate = $("input[name='previous_date']").val()
    var orgTo = $("input[name='previous_to']").val()
    var orgCc = $("input[name='previous_cc']").val()
    var body = `----- 원본 메시지 -----<br>제목: ${orgSubject}<br>발신: ${orgFrom} (${orgDate})<br>`
    if (orgTo !== "") {
        body = body + `수신: ${orgTo}`
    }
    if (orgCc !== "") {
        body = body + `<br>참조: ${orgCc}<br><br>`
    }

    resultObj.subject = subject;
    resultObj.body = body;

    return resultObj;
}
//안읽은 메일 리스트
async function unreadList(qObj, res, req, url) {

    referUrl = util.strLeft(url, ".nsf", true);
    await axios({
        method: "get",
        url: referUrl,
        httpsAgent: agent,
        headers: {
            "Cookie": qObj.cookie
        },
    }).then(function (response) {
        // console.log(response);
        return null;
    })

    var data = await axios({
        method: "get",
        url: url,
        httpsAgent: agent,
        headers: {
            "Content-Type": "application/json",
            "Cookie": qObj.cookie
        },
    })
        .then((response) => {

            return response.data;
        })
        .catch((error) => {
            throw new Error(error);
        });
    var jsonString = util.strRight(data, "<readviewentries>");
    jsonString = util.strLeftBack(jsonString, "<unreadinfo>");
    result = JSON.parse(jsonString);
    resultObj = {};
    dataArr = [];
    var size = qObj.size
    var page = qObj.page
    for (var i = size * page; i < size * page + size; i++) {
        var obj = {};
        if (result["viewentry"][i] == undefined) {
            break;
        } else {
            obj.unid = result.viewentry[i]['@unid'];
            obj.dockey = qObj.mailPath;
            if (result.viewentry[i]['@unread'] == "true") {
                obj.unread = true;
            } else {
                obj.unread = false;
            }
            obj.subject = result.viewentry[i].entrydata[4].text['0'];
            obj.folderName = "0";
            obj.attach = result.viewentry[i].entrydata[8].number['0'];
            if (obj.attach == "9999") {
                obj.attach = false;
            } else if (obj.attach == "5") {
                obj.attach = true;
            } else if (obj.attach == "0") {
                if (result.viewentry[i].entrydata[7].number['0'] == '9999') {
                    obj.attach = false;
                } else {
                    obj.attach = true;
                }
            } else if (obj.attach == '182' || obj.attach == '179') {
                if (result.viewentry[i].entrydata[7].number['0'] == '9999') {
                    obj.attach = false;
                } else {
                    obj.attach = true;
                }
            }
            obj.created = moment(result.viewentry[i].entrydata[5].datetime['0']).utc().format("YYYYMMDDTHHmmss");

            obj.importance = result.viewentry[i].entrydata[1].number['0'];
            if (obj.importance == "204") {
                obj.importance = true;
            } else {
                obj.importance = false;
            }

            try {
                obj.followup = result.viewentry[i].entrydata[9].number['0'];
                if (obj.followup == "182") {
                    obj.followup = true;
                } else {
                    obj.followup = false;
                }
            } catch (e) {
                if (result.viewentry[i].entrydata[8].number['0'] == "182") {
                    obj.followup = true;
                } else {
                    obj.followup = false;
                }
            }

            obj.sender = result.viewentry[i].entrydata[3].text['0'];

            let isToStuff = false;
            for (let b = 1; b < result.viewentry[i].entrydata.length; b++) {
                if (result.viewentry[i].entrydata[b]['@name'] == '$ToStuff') {
                    isToStuff = true;
                };
            };
            if (isToStuff) {
                if (result.viewentry[i].entrydata[7].text) {
                    obj.tostuff = { "receive": false, "ref": false };
                } else if (result.viewentry[i].entrydata[7].number['0'] == "184") {
                    obj.tostuff = { "receive": true, "ref": false };
                } else {
                    obj.tostuff = { "receive": false, "ref": false };
                }
            } else {
                obj.tostuff = { "receive": false, "ref": false };
            }

            dataArr.push(obj);
        }
    }
    if (dataArr[0] == undefined) {
        util.writeSuccess({}, res);
    } else {
        resultObj.data = dataArr;
        var total = util.strRight(data, "<unreadcount>");
        total = util.strLeft(total, "</unreadcount>");
        resultObj.total = total;
        util.writeSuccess(resultObj, res);
    }

    // console.log(result);
}
//휴지통에서 회수
async function recovery(qObj, res, req, url) {
    var url = config.host + config.mail.recovery;
    url = url.replace("#path#", qObj.mailPath);
    url = url.replace("#unid#", qObj.unid);
    await axios({
        method: "get",
        url: url,
        httpsAgent: agent,
        headers: {
            "Content-Type": "application/json",
            "Cookie": qObj.cookie
        },
    })
        .then((response) => {
            util.writeSuccess("done", res);
            return;
        })
        .catch((error) => {
            throw new Error(error);
        });
}
module.exports = { get, post, put, del };