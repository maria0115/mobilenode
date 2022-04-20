const util = require("../lib/util.js");
const logger = require("../lib/log.js");
const config = require("../config/config.json");
const common = require("../lib/common.js");
const path = require("path");
const axios = require("axios");
var xss = require("xss");
var moment = require("moment");

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
    //다국어 찾기
    var languageArr = qObj.cookie.split(";"); //['LtpaToken=AAECAzYwYjVlMWI1NjBiNWY5MjVwYXJraW5nN6ZpwmwB3W1vmia3XGR/k6gsexhZ',' DWP_LANG=ko',' language=ko']
    var language = "";
    for (i = 0; i < languageArr.length; i++) {
        if (languageArr[i].indexOf("language=") > -1) {
            var find = languageArr[i].split("=") //[ ' language', 'ko' ]
            language = find[1]; // ko
        }
    }
    qObj.language = language;

    //여기 부터 표준 api 코드 작성
    console.log("************myinfo***************");
    //사용자 사번 찾기
    var readerArr = qObj.readers.split("/"); //[ 'CN=박광순', 'OU=209003', 'O=SIS' ]
    qObj.sabun = util.strRight(readerArr[1], 'OU='); //209003
    qObj.mailPath = await common.getMailPath(qObj);
    var elasticUserInfo = await common.getUserInfo(qObj);
    qObj.elasticUserInfo = elasticUserInfo;
    var resultObj = {};
    var mailCount = await unreadMailCount(qObj);
    var photoUrl = config.photo;
    photoUrl = photoUrl.replace(/#sabun#/g, qObj.sabun);
    resultObj.photo = photoUrl;
    resultObj.mailCount = mailCount;
    var approve = await approveCount(qObj);
    resultObj.approvalCount = approve;
    var schedule = await scheduleCount(qObj);
    resultObj.scheduleCount = schedule;
    resultObj.info = await userInfo(qObj);
    resultObj.approvalInfo = await approvalP(qObj);
    var isAdmin = await getIsAdmin(qObj);
    resultObj.isAdmin = isAdmin;
    util.writeSuccess(resultObj, res);


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
    //여기 부터 표준 api 코드 작성
};
//사용자 결재 정보
async function approvalP(qObj) {
    var url = config.host + config.approval.getApprovalLine;
    url = url.replace("#empno#", qObj.sabun);
    //결재정보
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
            console.log("****************결재정보*******************");
            // console.log(response.data[1]);
            for (var i = 0; i < response.data.length; i++) {
                if (response.data[i]["_Isconc"] != "1") {
                    var jsonInfo = JSON.parse(response.data[i]["_jsoninfo"]);
                    var approvalInfo = "AP^1^S^" + jsonInfo["name"] + "^" + jsonInfo["empno"] + "^" + jsonInfo["notesid"] + "^" + jsonInfo["orgcode"] + "^" + jsonInfo["porgcode"] + "^" + jsonInfo["posname"] + "^" + jsonInfo["poscode"] + "^" + jsonInfo["posname"] + "^" + jsonInfo["poscode"] + "^" + jsonInfo["comcode"] + "^" + jsonInfo["orgname"] + "^" + jsonInfo["comname"] + "^^";
                }
            }
            return approvalInfo;
        })
        .catch((error) => {
            throw new Error(error);
        });
    return result;
}
//안읽은 메일 카운트
async function unreadMailCount(qObj) {
    var url = "";
    var setUrl = config.host + config.mail.unreadcount;
    url = setUrl.replace(/#path#/, qObj.mailPath);
    console.log(url);
    //받은 메일

    referUrl = util.strLeft(url, ".nsf", true);
    var resultData = await axios({
        method: "get",
        url: referUrl,
        httpsAgent: agent,
        headers: {
            "Cookie": qObj.cookie
        },
    }).then(function (response) {
        var result = axios({
            method: "get",
            url: url,
            httpsAgent: agent,
            headers: {
                "Content-Type": "application/json",
                "Cookie": qObj.cookie
            },
        })
            .then((response) => {
                var mailCount = util.strRight(response.data, "<unreadcount>");
                mailCount = util.strLeft(mailCount, "</unreadcount>");

                return mailCount;
            })
            .catch((error) => {
                return 0;
            });
        return result;
    }).catch((error) => {
        throw new Error(error);
    });

    return resultData
}
//결재할문서 카운트
async function approveCount(qObj) {
    var url = config.host + config.approval.approveCount;
    url = url.replace(/#sabun#/, qObj.sabun);
    var approvalCount = 0;
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
            approvalCount = response.data[0]['@siblings'];
            console.log("결재할 문서", approvalCount);
            return approvalCount;
        })
        .catch((error) => {
            console.log(error);
            return 0;
        });
    return result;
}
//오늘 스케쥴 카운트
async function scheduleCount(qObj) {
    //현재 시간 부터 일정 카운트
    var today = moment().format("YYYY-MM-DD");
    var today2 = moment().format("YYYY-MM-DDTHH:mm:ss");
    var affterOneYear = moment().add(1, 'years').format("YYYY-MM-DD");
    var scheduleCount = 0;
    var url = config.host + config.schedule.schedule;
    url = url.replace(/#sabun#/, qObj.sabun);
    url = url.replace(/#today#/, today);
    url = url.replace(/#start#/, today);
    url = url.replace(/#end#/, affterOneYear);
    //일정
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
            for (var i = 0; i < response.data.length; i++) {
                if (moment(today2).isBefore(response.data[i].end)) {
                    scheduleCount += 1;
                }
            }
            return scheduleCount;
        })
        .catch((error) => {
            return 0;
        });
    return result;
}
//유저 정보
async function userInfo(qObj) {
    var url = config.host_webserver + config.getUserInfo;
    // console.log(url);
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
            console.log("****************유저정보*******************");
            return response.data;

        })
        .catch((error) => {
            throw new Error(error);
        });
    var fullOrgCodeUrl = config.host_webserver + config.getFullOrgCode;
    fullOrgCodeUrl = fullOrgCodeUrl.replace("#unid#", qObj.elasticUserInfo.unid)
    // console.log(fullOrgCodeUrl);
    var fullOrgCode = await axios({
        method: "get",
        url: fullOrgCodeUrl,
        httpsAgent: agent,
        headers: {
            "Content-Type": "application/json",
            "Cookie": qObj.cookie
        },
    })
        .then((response) => {
            console.log("****************FullOrgCode*******************");
            return response.data;

        })
        .catch((error) => {
            throw new Error(error);
        });

    result.name = common.languageConverter(result.name, qObj.language, ",", ":");
    result.position = common.languageConverter(result.position, qObj.language, ",", ":");
    result.dept = common.languageConverter(result.dept, qObj.language, ",", ":");
    result.notesid = result.notesid.toUpperCase();
    result.fullOrgCode = fullOrgCode.FullOrgCode;
    result.vip = result['isVip']=="Y"?true:false;
    return result;
}
//로그인한 사용자가 관리자인지
async function getIsAdmin(qObj) {
    var url = config.host_webserver + config.isAdmin;
    // console.log(url);
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
            return response.data[1]["cuser"]["pinfo"]["isadmin"];

        })
        .catch((error) => {
            throw new Error(error);
        });
    if (result == "1") {
        return true;
    } else if (result == "0") {
        return false;
    } else {
        return false;
    }
}
module.exports = { get, post, put, del };