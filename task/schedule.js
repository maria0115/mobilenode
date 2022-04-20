const util = require("../lib/util.js");
const common = require("../lib/common.js");
const logger = require("../lib/log.js");
const config = require("../config/config.json");
const path = require("path");
const axios = require("axios");
var moment = require("moment");
var FormData = require('form-data');
let iconv = require('iconv-lite');
let fs = require('fs');

const express = require('express');
const app = express();
const multer = require('multer');
const upload = multer();
const cookie = require('cookie');

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
    if (qObj.cookie !== undefined) {
        const lang = cookie.parse(qObj.cookie);
        if (lang.hasOwnProperty("language")) {
            qObj.language = cookie.parse(qObj.cookie).language;
        }
    } else {
        qObj.language = "ko";
    }

    //여기 부터 표준 api 코드 작성

    //사번 찾기
    var userInfo = await common.getUserInfo(qObj);
    qObj.sabun = userInfo["empno"];
    //사용자 메일DB 찾기
    qObj.mailPath = await common.getMailPath(qObj);

    //일정
    //var url = `http://swg60.saerom.co.kr/emate_app/schedule.nsf/agGetEntryJson_iNotes?openagent&muserid=${sabun}&today=${today}&start=${qObj.start}&end=${qObj.end}`;
    //메인에 보여줄 오늘 일정, 월별 일정 리스트
    if (qObj.type === 'recent' || qObj.type === 'list') {
        var url = "";
        if (qObj.type === 'recent') {
            url = config.host + config.schedule.schedule;
            url = url.replace(/#sabun#/, qObj.sabun);
            url = url.replace(/#today#/, qObj.today);
            url = url.replace(/#start#/, qObj.today);
            url = url.replace(/#end#/, qObj.today);
        } else if (qObj.type === 'list') {
            url = config.host + config.schedule.schedule;
            url = url.replace(/#sabun#/, qObj.sabun);
            url = url.replace(/#today#/, qObj.today);
            url = url.replace(/#start#/, qObj.start);
            url = url.replace(/#end#/, qObj.end);
        }
        console.log(url);
        await getItemList(qObj, res, req, url);

    }
    //상세보기(열람함)
    else if (qObj.type === 'detail') {
        var url = config.host + config.schedule.detail;
        url = url.replace("#path#", qObj.mailPath);
        url = url.replace("#unid#", qObj.unid);
        console.log(url);
        getDetailItem(qObj, res, req, url);
    }
    //휴일
    else if (qObj.type === 'holiday') {
        util.writeSuccess([], res);
        return;
        // holiday(config, qObj, res, req);
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
    //사용자 메일DB 찾기
    qObj.mailPath = await common.getMailPath(qObj);
    //console.log("***************", mailPath);
    if (qObj.type === 'write') {
        // getDocUnid(qObj, res, req);
        await writeShimmerS(qObj, res, req);
    } else if (qObj.type === 'edit') {
        await writeShimmerS(qObj, res, req);
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
    qObj.mailPath = await common.getMailPath(qObj);
    //console.log("***************", mailPath);
    if (qObj.type == "select_delete") {
        var url = config.host + config.mail.select_delete;
        url = url.replace("#path#", qObj.mailPath);
        await deleteSchedule(qObj, res, req, url);
    }
};
//휴일 구하기
async function holiday(config, qObj, res, req) {
    var url = config.host + config.schedule.holiday;
    var startDate = qObj.year + "-" + qObj.month + "-01";
    var endDate = moment(startDate).endOf("month").format("YYYY-MM-DD");
    url = url.replace("#start#", startDate);
    url = url.replace("#end#", endDate);
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
            console.log("****************휴일*******************");
            return response.data;
        })
        .catch((error) => {
            throw new Error(error);
        });
    var resultArr = [];
    for (var i = 0; i < data.length; i++) {
        var resultObj = {};
        resultObj.unid = data[i]["id"];
        resultObj.subject = data[i]["title"];
        resultObj.startdate = data[i]["start"];
        resultObj.enddate = data[i]["end"];
        resultObj.allDay = data[i]["allDay"];
        resultObj.type = data[i]["sche_type"];
        resultArr.push(resultObj);
    }
    util.writeSuccess(resultArr, res);
}
//일정 선택 삭제
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

        // console.log(response.staus);
        util.writeSuccess('Done', res);
        return;
    });
}
//일정 리스트
async function getItemList(qObj, res, req, url) {
    console.log(url);
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
            console.log("****************일정*******************");
            // console.log(response.data);
            var resultArr = [];
            for (var i = 0; i < response.data.length; i++) {
                var obj = {};
                var unid = util.strLeft(response.data[i].id, "_")
                obj.unid = unid;
                obj.subject = response.data[i]._subject;
                obj.created = moment(response.data[i]._created).utc().format("YYYYMMDDTHHmmss");
                obj.author = response.data[i]._author;
                obj.startdate = response.data[i].startdate;
                obj.starttime = response.data[i].starttime;
                obj.enddate = response.data[i].enddate;
                obj.endtime = response.data[i].endtime;
                obj.location = response.data[i].loc;
                // console.log(response.data[i].start); moment(response.data[i].start).format("YYYYMMDDTHHmmss");
                if (response.data[i].category == '1' || response.data[i].category == '2') {
                    obj.allDay = true;

                } else {
                    obj.allDay = false;
                }
                var inotesDocModDateArr = response.data[i].url.split("&");
                for (var iDMDindx = 0; iDMDindx < inotesDocModDateArr.length; iDMDindx++) {
                    if (inotesDocModDateArr[iDMDindx].indexOf("inotesdocmoddate") > -1) {
                        obj.inotesDocModDate = util.strRight(inotesDocModDateArr[iDMDindx], "=");
                    }
                }

                if (response.data[i].category == '0') {
                    obj.category = "약속";
                } else if (response.data[i].category == '1') {
                    obj.category = "기념일";
                } else if (response.data[i].category == '2') {
                    obj.category = "행사";
                } else if (response.data[i].category == '3') {
                    obj.category = "회의";
                } else if (response.data[i].category == '4') {
                    obj.category = "리마인더";
                }

                resultArr[i] = obj;
            }
            util.writeSuccess(resultArr, res);
            return;
        })
        .catch((error) => {
            throw new Error(error);
        });
}
//상세보기(열람함) 사용안함
async function getDetailItem2(qObj, res, req, url) {
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
            console.log("****************일정 detail*******************");
            // console.log(response.data);
            return response.data;
        })
        .catch((error) => {
            throw new Error(error);
        });
    // console.log(data);
    var resultObj = {};
    resultObj.unid = data["@unid"];
    resultObj.subject = data["Subject"];
    resultObj.place = data["Location"];
    resultObj.created = moment(data["@created"]).utc().format("YYYYMMDDTHHmmss");
    // resultObj.locationTimeZone = data["LocalTimeZone"];
    // console.log(data["STARTDATETIME"]);
    // console.log(moment(data["STARTDATETIME"]).format("YYYYMMDDTHHmmss"));
    if (data.AppointmentType == "1" || data.AppointmentType == '2') {
        resultObj.allDay = true;
    } else {
        resultObj.allDay = false;
    }
    resultObj.startdate = data["StartDate"];
    resultObj.starttime = data["StartTime"];
    resultObj.enddate = data["EndDate"];
    resultObj.endtime = data["EndTime"];
    resultObj.startDateTime = moment(data["STARTDATETIME"]).format("YYYYMMDDTHHmmss") + "$" + data["LocalTimeZone"];

    if (data["OrgConfidential"] == "" || data["OrgConfidential"] == undefined || data["OrgConfidential"] == "undefined") {
        resultObj.secret = "공개";
        resultObj.secretVal = false;
    } else if (data["OrgConfidential"] == "1") {
        resultObj.secret = "비공개";
        resultObj.secretVal = true;
    }

    if (data.AppointmentType == '0') {
        resultObj.category = "약속";
        resultObj.categoryVal = 0;
    } else if (data.AppointmentType == '1') {
        resultObj.category = "기념일";
        resultObj.categoryVal = 1;
    } else if (data.AppointmentType == '2') {
        resultObj.category = "행사";
        resultObj.categoryVal = 2;
    } else if (data.AppointmentType == '3') {
        resultObj.category = "회의";
        resultObj.categoryVal = 3;
    } else if (data.AppointmentType == '4') {
        resultObj.category = "리마인더";
        resultObj.categoryVal = 4;
    }
    //body
    for (var bodyIndx = 0; bodyIndx < data["Body"]["content"].length; bodyIndx++) {
        if (data["Body"]["content"][bodyIndx]["contentType"].indexOf("text/html;") > -1) {
            resultObj.body = Buffer.from(data["Body"]["content"][bodyIndx]["data"], "base64").toString('utf8');
        }
    }

    //attachment
    var attachInfo = await getAttachInfo(qObj);
    resultObj.attachInfo = attachInfo;

    util.writeSuccess(resultObj, res);
}
//상세보기(열람함) 사용
async function getDetailItem(qObj, res, req, url) {
    console.log(url,"getDetailItem")
    var data = await axios({
        method: "get",
        url: url,
        headers: {
            "Content-Type": "application/json;charset=UTF-8",
            "Cookie": qObj.cookie
        },
    })
        .then((response) => {
            console.log("****************일정 detail*******************");
            console.log(url,"일정 detail");
            // console.log(response.data);
            return response.data;
        })
        .catch((error) => {
            throw new Error(error);
        });
        // console.log(data)
    data = util.strRight(data, '"item":');
    data = util.strLeft(data, '}).item}');
    data = JSON.parse(data);
    // console.log(data);
    var resultObj = {};
    var fileNameArr, fileSizeArr;
    var sendToNameArr, sendToAddressArr;
    var copyToNameArr, copyToAddressArr;
    var bcopyToNameArr, bcopyToAddressArr;
    for (var dataIdx = 0; dataIdx < data.length; dataIdx++) {
        var dataObj = data[dataIdx];
        if (dataObj["@name"] === "From") {
            resultObj.authorId = dataObj["textlist"]["text"][0]["0"].toUpperCase();
        }
        if (dataObj["@name"] === "APPTUNID") {
            resultObj.unid = dataObj["textlist"]["text"][0]["0"];
        }
        if (dataObj["@name"] === "Subject") {
            resultObj.subject = dataObj["textlist"]["text"][0]["0"];
        }
        if (dataObj["@name"] === "Location") {
            resultObj.place = dataObj["textlist"]["text"][0]["0"];
        }
        if (dataObj["@name"] === "s_DocCreated") {
            resultObj.created = moment(dataObj["datetimelist"]["datetime"][0]["0"]).utc().format("YYYYMMDDTHHmmss");
        }
        if (dataObj["@name"] === "StartDate") {
            resultObj.startdate = moment(dataObj["datetimelist"]["datetime"][0]["0"], "YYYYMMDD").format("YYYY-MM-DD");
        }
        if (dataObj["@name"] === "STARTTIME") {
            resultObj.starttime = moment(dataObj["datetimelist"]["datetime"][0]["0"], "THHmmSS").format("HH:mm:ss");
        }
        if (dataObj["@name"] === "EndDate") {
            resultObj.enddate = moment(dataObj["datetimelist"]["datetime"][0]["0"], "YYYYMMDD").format("YYYY-MM-DD");
        }
        if (dataObj["@name"] === "ENDTIME") {
            resultObj.endtime = moment(dataObj["datetimelist"]["datetime"][0]["0"], "THHmmSS").format("HH:mm:ss");
        }
        if (dataObj["@name"] === "StartTimeZone") {
            resultObj.startTimeZone = dataObj["textlist"]["text"][0]["0"];
        }
        if (dataObj["@name"] === "STARTDATETIME") {
            resultObj.startDateTime = moment(dataObj["datetimelist"]["datetime"][0]["0"]).format("YYYYMMDDTHHmmss") + "$" + resultObj.startTimeZone;
        }
        if (dataObj["@name"] === "EndTimeZone") {
            resultObj.endTimeZone = dataObj["textlist"]["text"][0]["0"];
        }
        if (dataObj["@name"] === "ENDDATETIME") {
            resultObj.endDateTime = moment(dataObj["datetimelist"]["datetime"][0]["0"]).format("YYYYMMDDTHHmmss") + "$" + resultObj.endTimeZone;
        }
        if (dataObj["@name"] == "OrgConfidential") {
            var secret = dataObj["textlist"]["text"][0]["0"];
            if (secret == "" || secret == undefined || secret == "undefined") {
                resultObj.secret = "공개"
                resultObj.secretVal = false;
            } else if (secret == 1 || secret == "1") {
                resultObj.secret = "비공개"
                resultObj.secretVal = true;
            }
        }
        if (dataObj["@name"] === "AppointmentType") {
            var category = dataObj["textlist"]["text"][0]["0"];

            if (category == '0') {
                resultObj.category = "약속";
                resultObj.categoryVal = 0;
                resultObj.allDay = false;
            } else if (category == '1') {
                resultObj.category = "기념일";
                resultObj.categoryVal = 1;
                resultObj.allDay = true;
            } else if (category == '2') {
                resultObj.category = "행사";
                resultObj.categoryVal = 2;
                resultObj.allDay = true;
            } else if (category == '3') {
                resultObj.category = "회의";
                resultObj.categoryVal = 3;
                resultObj.allDay = false;
            } else if (category == '4') {
                resultObj.category = "리마인더";
                resultObj.categoryVal = 4;
                resultObj.allDay = false;
            }
        }
        try {
            if (dataObj["@name"] === "h_AttachmentNames") {
                fileNameArr = dataObj["textlist"]["text"];
            }
            if (dataObj["@name"] === "h_AttachmentLengths") {
                fileSizeArr = dataObj["numberlist"]["number"];
            }
        } catch (e) {
            fileNameArr = [];
            fileSizeArr = [];
        }

        try {
            if (dataObj["@name"] === "AltRequiredNames") {
                sendToNameArr = dataObj["textlist"]["text"];
            }
            if (dataObj["@name"] === "INETREQUIREDNAMES") {
                sendToAddressArr = dataObj["textlist"]["text"];
            }
        } catch (e) {
            sendToNameArr = [];
            sendToAddressArr = [];
        }

        try {
            if (dataObj["@name"] === "AltOptionalNames") {
                copyToNameArr = dataObj["textlist"]["text"];
            }
            if (dataObj["@name"] === "INETOPTIONALNAMES") {
                copyToAddressArr = dataObj["textlist"]["text"];
            }
        } catch (e) {
            copyToNameArr = [];
            copyToAddressArr = [];
        }

        try {
            if (dataObj["@name"] === "AltFYINames") {
                bcopyToNameArr = dataObj["textlist"]["text"];
            }
            if (dataObj["@name"] === "INETFYINAMES") {
                bcopyToAddressArr = dataObj["textlist"]["text"];
            }
        } catch (e) {
            bcopyToNameArr = [];
            bcopyToAddressArr = [];
        }

    }

    var attachArr = [];
    for (var attachIdx = 0; attachIdx < fileNameArr.length; attachIdx++) {
        var attachObj = {};
        attachObj.name = fileNameArr[attachIdx]["0"];
        attachObj.size = common.formatBytes(fileSizeArr[attachIdx]["0"], 2);
        attachObj.url = "/" + qObj.mailPath + "/IMAPInbox/" + qObj.unid + "/$FILE/" + fileNameArr[attachIdx]["0"];
        attachArr[attachIdx] = attachObj;
    }
    resultObj.attachInfo = attachArr;

    try {
        if (sendToNameArr[0]["0"] != "") {
            var sendToArr = [];
            var sendToInfo = [];
            for (sendToIdx = 0; sendToIdx < sendToNameArr.length; sendToIdx++) {
                // console.log(sendToNameArr[sendToIdx]);
                var sendToObj = {};
                var nameArr = sendToNameArr[sendToIdx]["0"].split("/");
                sendToObj.name = nameArr[0];
                sendToObj.address = sendToAddressArr[sendToIdx]["0"];
                sendToArr[sendToIdx] = sendToObj;
                qObj.editSabun = nameArr[1];
                sendToInfo[sendToIdx] = await editInfo(qObj);
            }
            resultObj.sendToInfo = sendToInfo;
            resultObj.sendTo = sendToArr;
        } else {
            resultObj.sendToInfo = [];
            resultObj.sendTo = [];
        }
    } catch (e) {
        resultObj.sendToInfo = [];
        resultObj.sendTo = [];
    }

    try {
        if (copyToNameArr[0]["0"] != "") {
            var copyToArr = [];
            var copyToInfo = [];

            for (copyToIdx = 0; copyToIdx < copyToNameArr.length; copyToIdx++) {
                var copyToObj = {};
                var nameArr = copyToNameArr[copyToIdx]["0"].split("/");
                copyToObj.name = nameArr[0];
                copyToObj.address = copyToAddressArr[copyToIdx]["0"];
                copyToArr[copyToIdx] = copyToObj;
                qObj.editSabun = nameArr[1];
                copyToInfo[copyToIdx] = await editInfo(qObj);
            }
            resultObj.copyToInfo = copyToInfo;
            resultObj.copyTo = copyToArr;
        } else {
            resultObj.copyToInfo = [];
            resultObj.copyTo = [];
        }
    } catch (e) {
        resultObj.copyToInfo = [];
        resultObj.copyTo = [];
    }
    // console.log(bcopyToNameArr);
    try {
        if (copyToNameArr[0]["0"] != "") {
            var bcopyToArr = [];
            var bcopyToInfo = [];
            for (bcopyToIdx = 0; bcopyToIdx < bcopyToNameArr.length; bcopyToIdx++) {
                var bcopyToObj = {};
                var nameArr = bcopyToNameArr[bcopyToIdx]["0"].split("/");
                bcopyToObj.name = nameArr[0];
                bcopyToObj.address = bcopyToAddressArr[bcopyToIdx]["0"];
                bcopyToArr[bcopyToIdx] = bcopyToObj;
                qObj.editSabun = nameArr[1];
                bcopyToInfo[bcopyToIdx] = await editInfo(qObj);
            }
            resultObj.bcopyToInfo = bcopyToInfo;
            resultObj.bcopyTo = bcopyToArr;
        } else {
            resultObj.bcopyToInfo = [];
            resultObj.bcopyTo = [];
        }
    } catch (e) {
        resultObj.bcopyToInfo = [];
        resultObj.bcopyTo = [];
    }

    
    resultObj.bodyurl = config.bodyurl;
    
    if(config.bodyurl){
        var url = config.schedule.detail_body;
        url = url.replace("#path#", qObj.mailPath);
        url = url.replace("#unid#", qObj.unid);
        resultObj.body = url;
        console.log("url",url)
    }else{
        var body = await getDetailBody(qObj);
        resultObj.body = body;
    }

    util.writeSuccess(resultObj, res);

}
//전송 전 ShimmerS 구하기
async function writeShimmerS(qObj, res, req) {
    var mailPath = await common.getMailPath(qObj);
    // console.log("***************", mailPath);
    // var s = getCookie("ShimmerS");
    var d = new Date();

    var temp_str = d.getFullYear() + ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2) + "T" + ("0" + d.getHours()).slice(-2) + ("0" + d.getMinutes()).slice(-2) + "00,00Z";
    // console.log("temp_str==============  ", temp_str);
    var referUrl = config.host + "/" + mailPath + "/iNotes/Mail/?OpenDocument&ui=dwa_frame&l=ko&gz&CR&MX&TS=" + temp_str + "&charset=UTF-8&charset=UTF-8&KIC&ua=ie&pt&gn";
    // var referUrl = config.host + "/" + mailPath + "?open";
    console.log(referUrl);
    await axios({
        method: "get",
        url: referUrl,
        httpsAgent: agent,
        headers: {
            "Cookie": qObj.cookie
        },
    }).then((response) => {
        // console.log(response);
        console.log(response.headers['set-cookie']);
        qObj.cookie += " " + response.headers['set-cookie'][0];
        var cookieArr = qObj.cookie.split(";");
        for (var cookieArrIdx = 0; cookieArrIdx < cookieArr.length; cookieArrIdx++) {
            if (cookieArr[cookieArrIdx].indexOf("ShimmerS=") > -1) {
                qObj.shimmerS = util.strRight(cookieArr[cookieArrIdx], ":M&N:");
                // console.log("qObj.shimmerS=============", qObj.shimmerS);
            }
        }
        return null;
    }).catch((error) => {
        throw new Error(error);
    });

    if (qObj.type == "write") {
        getDocUnid(qObj, res, req);
    } else if (qObj.type == "edit") {
        edit(qObj, res, req);
    }
}
async function getDocUnid(qObj, res, req) {
    var url = config.host + config.schedule.getDocUnid;
    url = url.replace("#path#", qObj.mailPath);

    var formdata = new FormData();
    formdata.append("Form", "Appointment");
    formdata.append("%%Nonce", qObj.shimmerS);
    formdata.append("%%PostCharset", "UTF-8");
    formdata.append("h_SetCommand", "h_ShimmerSave");
    formdata.append("h_SetEditCurrentScene", "l_StdPageEdit");
    formdata.append("h_SetEditNextScene", "l_StdPageRedirect");
    formdata.append("h_EditAction", "h_Next");
    formdata.append("s_ImageSaveAsName", "");
    formdata.append("h_ImageURL", "");

    console.log(url);
    var unid = ""
    await axios({
        method: "post",
        url: url,
        httpsAgent: agent,
        headers: {
            "Content-Type": formdata.getHeaders()["content-type"],
            "Cookie": qObj.cookie,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.159 Safari/537.36"
        },
        data: formdata
    })
        .then((response) => {
            // console.log("^^^^^^^^^^^", response);
            // console.log(response.data, "^^^^^^^^^^^");
            unid = util.strRight(response.data, "EHq(DhU, '");
            // console.log(unid, "..........................");
            unid = util.strLeft(unid, "'),");
            qObj.unid = unid;
            // util.writeSuccess(response.data, res);
            return;
        })
        .catch((error) => {
            throw new Error(error);
        });
    await write(qObj, res, req);
    // axios({
    //     method: "post",
    //     url: url,
    //     httpsAgent: agent,
    //     headers: {
    //         "Content-Type": "multipart/form-data;",
    //         "Cookie": qObj.cookie
    //     },
    //     data: formdata
    // }).then(function (response) {
    //     console.log(response);
    //     return null;
    // }).then((rslt) => write(qObj, res, req));
}

async function write(qObj, res, req) {
    // console.log(qObj);
    var url = config.schedule.write;
    url = url.replace("#path#", qObj.mailPath);
    url = url.replace("#unid#", qObj.unid);

    console.log(url);
    var formdata = new FormData();
    // var cookieArr = qObj.cookie.split(";");
    // for (var cookieArrIdx = 0; cookieArrIdx < cookieArr.length; cookieArrIdx++) {
    //     if (cookieArr[cookieArrIdx].indexOf("ShimmerS=") > -1) {
    //         qObj.shimmerS = util.strRight(cookieArr[cookieArrIdx], ":M&N:");
    //         console.log("qObj.shimmerS??????????????", qObj.shimmerS);
    //     }
    // }
    //ShimmerS
    formdata.append("%%Nonce", qObj.shimmerS);
    //작성자
    formdata.append("From", qObj.readers); //CN=박광순/OU=209003/O=SIS
    formdata.append("Principal", qObj.readers); //CN=박광순/OU=209003/O=SIS
    //제목
    formdata.append("Subject", qObj.formdata.subject);//node TEST
    formdata.append("h_Name", qObj.formdata.subject);//node TEST
    //받는 사람 = 진성원/204010/SIS@SIS;KIM.HYEONDAM/ksis211022/SIS@SIS
    formdata.append("EnterSendTo", qObj.formdata.sendTo);
    //참조  = MOON HYEONIL/ksis213008/SIS@SIS;배선일/209002/SIS@SIS
    formdata.append("EnterCopyTo", qObj.formdata.copyTo);
    //숨은 참조 = 박상기/215019/SIS@SIS;이정인/216006/SIS@SIS
    formdata.append("EnterBlindCopyTo", qObj.formdata.blindCopyTo);
    //시작하는 날짜
    formdata.append("StartDate", qObj.formdata.startDate + "$Z=-9$DO=0$ZX=59$ZN=Korea"); //20210809T040000
    formdata.append("s_InstDate", qObj.formdata.startDate + "$Z=-9$DO=0$ZX=59$ZN=Korea");
    formdata.append("ThisInstDate", qObj.formdata.startDate + "$Z=-9$DO=0$ZX=59$ZN=Korea");
    formdata.append("ThisStartDate", qObj.formdata.startDate + "$Z=-9$DO=0$ZX=59$ZN=Korea");
    formdata.append("StartTimeZone", "Z=-9$DO=0$ZX=59$ZN=Korea");
    //끝나는 날짜
    formdata.append("EndDate", qObj.formdata.endDate + "$Z=-9$DO=0$ZX=59$ZN=Korea"); //20210809T200000
    formdata.append("ThisEndDate", qObj.formdata.endDate + "$Z=-9$DO=0$ZX=59$ZN=Korea");
    formdata.append("EndTimeZone", "Z=-9$DO=0$ZX=59$ZN=Korea");
    //장소
    formdata.append("Location", qObj.formdata.location); //text
    formdata.append("LocalTimeZone", "Z=-9$DO=0$ZX=59$ZN=Korea");
    //반복예약
    formdata.append("Repeats", qObj.formdata.Repeats); // 반복에약 없음 "", 반복예약 선택시 1
    if (qObj.formdata.Repeats == "" || qObj.formdata.Repeats == undefined) {
        qObj.formdata.RepeatUnit = "";
        qObj.formdata.RepeatInterval = "";
        qObj.formdata.RepeatWeekends = "";
        qObj.formdata.RepeatAdjust = "";
        qObj.formdata.RepeatStartDate = "";
        qObj.formdata.RepeatHow = "";
        qObj.formdata.RepeatUntil = "";
        qObj.formdata.RepeatFor = "";
        qObj.formdata.RepeatForUnit = "";
    }
    formdata.append("RepeatUnit", qObj.formdata.RepeatUnit); //name : 일 단위, 주 단위, 월 단위(날짜), 월 단위(요일), 년 단위  value : D, W, MD, MP, Y
    formdata.append("RepeatInterval", qObj.formdata.RepeatInterval);/*일 단위 일때
                                                                    매일 반복~31일마다 반복=01~31
                                                                    매주 반복~8주마다 반복=01~08
                                                                    매월 반복~12개월마다 반복=01~12
                                                                    매년 반복~12개월마다 반복=01~10*/
    formdata.append("RepeatWeekends", qObj.formdata.RepeatWeekends);//일 단위 선택 시 에만 value : D 나머지는 ""
    if (qObj.formdata.RepeatAdjust == undefined || qObj.formdata.RepeatAdjust == "undefined" || qObj.formdata.RepeatAdjust == "") {
        qObj.formdata.RepeatAdjust = "";
    }
    formdata.append("RepeatAdjust", qObj.formdata.RepeatAdjust);/*주 반복 일때
                                                                일요일~토요일=00~06
                                                                월(날짜) 반복 일때- 1일~31일=01~31
                                                                월(요일) 반복 일때- 첫번째 일요일~마지막 금요일=1.0~5.6*/
    if (qObj.formdata.RepeatStartDate == "" || qObj.formdata.RepeatStartDate == undefined) {
        qObj.formdata.RepeatStartDate = "";
    } else {
        qObj.formdata.RepeatStartDate = qObj.formdata.RepeatStartDate + "$Z=-9$DO=0$ZX=59$ZN=Korea";
    }
    formdata.append("RepeatStartDate", qObj.formdata.RepeatStartDate);  //name: RepeatStartDate     value : 20210817T150000$Z=-9$DO=0$ZX=59$ZN=Korea
    formdata.append("RepeatHow", qObj.formdata.RepeatHow); // name: 종료,기간              value : U,F
    formdata.append("RepeatUntil", qObj.formdata.RepeatUntil); // 종료일때 name: 종료                 value : 20210831
    formdata.append("RepeatFor", qObj.formdata.RepeatFor); // 기간일때 name: 값 그대로              value : 값 그대로
    formdata.append("RepeatForUnit", qObj.formdata.RepeatForUnit); // name: 일, 주, 개월, 년        value : D, W, M, Y
    formdata.append("RepeatFromEnd", "");

    //
    //
    //본문 내용
    formdata.append("Body", qObj.formdata.body);
    //공개
    if (qObj.formdata.private == false || qObj.formdata.private == "false") {
        formdata.append("OrgConfidential", "");
        formdata.append("$PublicAccess", "1");
    }
    //비공개
    else if (qObj.formdata.private == true || qObj.formdata.private == "true") {
        formdata.append("OrgConfidential", "1");
        formdata.append("$PublicAccess", "");
    }

    //약속=0
    if (qObj.formdata.category == "0") {
        console.log("약속@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@");
        formdata.append("AppointmentType", "0");
        formdata.append("$BusyPriority", "1");
        formdata.append("$AlarmUnit", "M");
        formdata.append("tmpAlarmUnit", "M");
        formdata.append("BookFreeTime", "");
        formdata.append("PencilIn", "1");
        formdata.append("tmpAlarmOffset", "-30");
    }
    //기념일=1
    else if (qObj.formdata.category == "1") {
        console.log("기념일@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@");
        formdata.append("AppointmentType", "1");
        formdata.append("$BusyPriority", "2");
        formdata.append("$AlarmUnit", "D");
        formdata.append("tmpAlarmUnit", "D");
        formdata.append("BookFreeTime", "1");
        formdata.append("PencilIn", "2");
        formdata.append("tmpAlarmOffset", "-1440");

    }
    //행사=2
    else if (qObj.formdata.category == "2") {
        console.log("행사@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@");
        formdata.append("AppointmentType", "2");
        formdata.append("$BusyPriority", "1");
        formdata.append("$AlarmUnit", "D");
        formdata.append("tmpAlarmUnit", "D");
        formdata.append("BookFreeTime", "");
        formdata.append("PencilIn", "1");
        formdata.append("tmpAlarmOffset", "-1440");
    }
    //회의=3
    else if (qObj.formdata.category == "3") {
        console.log("회의@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@");
        formdata.append("AppointmentType", "3");
        formdata.append("$BusyPriority", "");
        formdata.append("$AlarmUnit", "M");
        formdata.append("tmpAlarmUnit", "M");
        formdata.append("BookFreeTime", "");
        formdata.append("PencilIn", "1");
        formdata.append("tmpAlarmOffset", "-30");
    }
    //리마인더=4
    else if (qObj.formdata.category == "4") {
        console.log("리마인더@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@");
        formdata.append("AppointmentType", "4");
        formdata.append("$BusyPriority", "2");
        formdata.append("$AlarmUnit", "M");
        formdata.append("tmpAlarmUnit", "M");
        formdata.append("BookFreeTime", "");
        formdata.append("PencilIn", "");
        formdata.append("tmpAlarmOffset", "-0");
    }

    //첨부파일
    for (var attachInx = 0; attachInx < qObj.file.length; attachInx++) {
        // console.log("첨부 정보", qObj.file[attachInx].buffer);
        formdata.append(`HaikuUploadAttachment${attachInx}`, qObj.file[attachInx].buffer, { filename: qObj.file[attachInx].originalname });
    }
    ///////////////////////////////////////////////////////////////////////////////////////////
    formdata.append("$Alarm", "0");
    formdata.append("$AlarmDescription", "");
    formdata.append("$AlarmMemoOptions", "");
    formdata.append("$AlarmOffset", "");
    formdata.append("$AlarmSendTo", "");
    formdata.append("$AlarmSound", "");
    formdata.append("$AlarmTime", "");
    formdata.append("$CSSMTPPreserveHTMLInDesc", "");
    formdata.append("$Disclaimed", "");
    formdata.append("$TMP_iCal_CID_List", "");
    formdata.append("$WFModified", "");
    formdata.append("$WIModified", "");
    formdata.append("%%PostCharset", "UTF-8");
    formdata.append("AlarmOnDate", "");
    formdata.append("AlarmOnTime", "");
    formdata.append("Alarms", "0");
    formdata.append("AlarmTiming", "-1");
    formdata.append("ApptUNIDURL", "");
    formdata.append("AudioVideoFlags", "");
    formdata.append("BodyImgCids", "");
    formdata.append("BodyPT", "");
    formdata.append("BookFreeTime", "");
    formdata.append("Broadcast", "");
    formdata.append("Categories", "");
    formdata.append("DeliveryPriority", "N");
    formdata.append("DeliveryReport", "B");
    formdata.append("Encrypt", "0");
    formdata.append("ExcludeFromView", "S;D;A");
    formdata.append("Form", "Appointment");
    formdata.append("h_AlarmOn", "");
    formdata.append("h_AttachmentAppleTypes", "");
    formdata.append("h_AttachmentFileItemNames", "");
    formdata.append("h_AttachmentRealNames", "");
    formdata.append("h_DestFolder", "");
    formdata.append("h_DictionaryId", "");
    formdata.append("h_EditAction", "h_Next");
    formdata.append("h_EditSceneTrail", "");
    formdata.append("h_ImageCount", "");
    formdata.append("h_MeetingCommand", "");
    formdata.append("h_Move", "");
    formdata.append("h_NoSceneTrail", "0");
    formdata.append("h_NumOfPageText", "");
    formdata.append("h_PageText", "");
    formdata.append("h_RichTextItem", "");
    formdata.append("s_SendNotice", "0");
    formdata.append("h_SceneContext", "");
    formdata.append("h_SetCommand", "h_ShimmerSave");
    formdata.append("h_SetDeleteList", "");
    formdata.append("h_SetDeleteListCS", "");
    formdata.append("h_SetEditCurrentScene", "l_StdPageEdit");
    formdata.append("h_SetEditNextScene", "");
    formdata.append("h_SetParentUnid", "");
    formdata.append("h_SetPublishAction", "h_Publish");
    formdata.append("h_SetPublishToFolder", "");
    formdata.append("h_SetReturnURL", "[[./&Form=l_CallListener]]");
    formdata.append("h_SetSaveDoc", "1");
    formdata.append("h_SpellCheckStatus", "");
    formdata.append("h_WorkflowStage", "");
    formdata.append("hFailedUsers", "");
    formdata.append("Importance", "");
    formdata.append("In_Reply_To", "");
    formdata.append("JITUsers", "");
    formdata.append("MailOptions", "1");
    formdata.append("MeetingPassword", "");
    formdata.append("NewEndDate", "");
    formdata.append("NewEndTimeZone", "");
    formdata.append("NewStartDate", "");
    formdata.append("NewStartTimeZone", "");
    formdata.append("NoDomRecips", "");
    formdata.append("NotesRecips", "");
    formdata.append("OnlineMeeting", "");
    formdata.append("OnlinePlace", "");
    formdata.append("OnlinePlaceToReserve", "");
    formdata.append("References", "");
    formdata.append("RemoveAtClose", "");
    formdata.append("Resources", "");
    formdata.append("RescheduleWhich", "");
    formdata.append("RestrictAttendence", "");
    formdata.append("ReturnReceipt", "");
    formdata.append("RoomToReserve", "");
    formdata.append("s_ActionFlags", "");
    formdata.append("s_ActionInProgress", "");
    formdata.append("s_AllRecips", "");
    formdata.append("s_BodyCid", "");
    formdata.append("s_CidImageInfo", "");
    formdata.append("s_ConvertImage", "0");
    formdata.append("s_ConvertQuickrIconImageInfo", "");
    formdata.append("s_DataUriInfo", "");
    formdata.append("s_DisclaimerIsAdded", "0");
    formdata.append("s_EmbeddedImageInfo", "");
    formdata.append("s_IgnoreQuota", "0");
    formdata.append("s_ImageUseCidRef", "");
    formdata.append("s_IsPublished", "0");
    formdata.append("s_LDAPGroup", "");
    formdata.append("s_MailSendReturnPage", "");
    formdata.append("s_MailViewBefore", "");
    formdata.append("s_NewAltFYIAttendees", "");
    formdata.append("s_NewAltOptionalAttendees", "");
    formdata.append("s_NewAltRequiredAttendees", "");
    formdata.append("s_NewBody", "");
    formdata.append("s_NewFolderList", "");
    formdata.append("s_NewFYIAttendees", "");
    formdata.append("s_NewLocation", "");
    formdata.append("s_NewOptionalAttendees", "");
    formdata.append("s_NewRequiredAttendees", "");
    formdata.append("s_NewResource", "");
    formdata.append("s_NewRoom", "");
    formdata.append("s_NewSubject", "");
    formdata.append("s_NotesLinkIconInfo", "");
    formdata.append("s_PlainEditor", "0");
    formdata.append("s_RescheduleWhich", "");
    formdata.append("s_SendAndFile", "");
    formdata.append("s_SetForwardedFrom", "0");
    formdata.append("s_SetReplyFlag", "0");
    formdata.append("s_SetRFSaveInfo", "");
    formdata.append("s_StatusUpdateCid", "");
    formdata.append("s_SubjectText", "");
    formdata.append("s_UsePlainText", "0");
    formdata.append("s_UsePlainTextAndHTML", "0");
    formdata.append("s_ViewName", "");
    formdata.append("s_WithAddRemove", "");
    formdata.append("SametimeType", "");
    formdata.append("SaveOptions", "");
    formdata.append("Sign", "0");
    formdata.append("SMIMERecips", "");
    formdata.append("SMIMESign", "");
    formdata.append("StatusUpdate", "");
    formdata.append("StatusUpdatePT", "");
    formdata.append("STConfPhone", "");
    formdata.append("STPermissions", "");
    formdata.append("STPermPresent", "");
    formdata.append("STRecordMeeting", "");
    formdata.append("STRoomName", "");
    formdata.append("STSortOrder", "");
    formdata.append("STUnyteConferenceID", "");
    formdata.append("STUnyteConferenceURL", "");
    formdata.append("SvcSelection", "");
    formdata.append("tmpAction", "");
    formdata.append("tmpAlarmTiming", "");
    formdata.append("tmpCommentIncluded", "");
    formdata.append("tmpDelegee", "");
    formdata.append("tmpdlgConfCall", "");
    formdata.append("tmpKeepPosted", "");
    formdata.append("tmpLocalizedKeywords", "");
    formdata.append("tmpRemoveNames", "");
    formdata.append("tmpRemoveResource", "");
    formdata.append("tmpRemoveRRNames", "");
    formdata.append("Topic", "");
    formdata.append("TrustInetCerts", "0");


    // console.log("전송 쿠키", qObj.cookie);
    formdata.submit({
        host: config.submitHost,
        path: url,
        headers: {
            'cookie': qObj.cookie
        }
    }, function (err, resp) {
        if (err) throw err;
        console.log("statusCode : ", res.statusCode);
        if (res.statusCode == 200) {
            console.log("******************* 일정 등록 완료 *******************");
        }

        util.writeSuccess('Done', res);
    });
}
function edit(qObj, res, req) {
    var url = config.schedule.edit;
    // console.log(qObj.formdata);
    url = url.replace("#path#", qObj.mailPath);
    url = url.replace("#unid#", qObj.formdata.unid);

    console.log(url);
    var formdata = new FormData();

    //ShimmerS
    formdata.append("%%Nonce", qObj.shimmerS);
    //작성자
    formdata.append("From", qObj.readers); //CN=박광순/OU=209003/O=SIS
    formdata.append("Principal", qObj.readers); //CN=박광순/OU=209003/O=SIS
    //제목
    formdata.append("Subject", qObj.formdata.subject);//node TEST
    formdata.append("h_Name", qObj.formdata.subject);//node TEST
    //받는 사람 = 진성원/204010/SIS@SIS;KIM.HYEONDAM/ksis211022/SIS@SIS
    // formdata.append("EnterSendTo", "진성원/204010/SIS@SIS");
    formdata.append("EnterSendTo", qObj.formdata.sendTo);
    console.log(qObj.formdata.sendTo);
    //참조  = MOON HYEONIL/ksis213008/SIS@SIS;배선일/209002/SIS@SIS
    formdata.append("EnterCopyTo", qObj.formdata.copyTo);
    //숨은 참조 = 박상기/215019/SIS@SIS;이정인/216006/SIS@SIS
    formdata.append("EnterBlindCopyTo", qObj.formdata.blindCopyTo);
    //시작하는 날짜
    formdata.append("StartDate", qObj.formdata.startDate + "$Z=-9$DO=0$ZX=59$ZN=Korea"); //20210809T040000
    formdata.append("s_InstDate", qObj.formdata.startDate + "$Z=-9$DO=0$ZX=59$ZN=Korea");
    formdata.append("ThisInstDate", qObj.formdata.startDate + "$Z=-9$DO=0$ZX=59$ZN=Korea");
    formdata.append("ThisStartDate", qObj.formdata.startDate + "$Z=-9$DO=0$ZX=59$ZN=Korea");
    formdata.append("StartTimeZone", "Z=-9$DO=0$ZX=59$ZN=Korea");
    //끝나는 날짜
    formdata.append("EndDate", qObj.formdata.endDate + "$Z=-9$DO=0$ZX=59$ZN=Korea"); //20210809T200000
    formdata.append("ThisEndDate", qObj.formdata.endDate + "$Z=-9$DO=0$ZX=59$ZN=Korea");
    formdata.append("EndTimeZone", "Z=-9$DO=0$ZX=59$ZN=Korea");
    //장소
    formdata.append("Location", qObj.formdata.location); //text
    formdata.append("LocalTimeZone", "Z=-9$DO=0$ZX=59$ZN=Korea");
    //반복예약
    formdata.append("Repeats", qObj.formdata.Repeats); // 반복에약 없음 "", 반복예약 선택시 1
    if (qObj.formdata.Repeats == "" || qObj.formdata.Repeats == undefined) {
        qObj.formdata.RepeatUnit = "";
        qObj.formdata.RepeatInterval = "";
        qObj.formdata.RepeatWeekends = "";
        qObj.formdata.RepeatAdjust = "";
        qObj.formdata.RepeatStartDate = "";
        qObj.formdata.RepeatHow = "";
        qObj.formdata.RepeatUntil = "";
        qObj.formdata.RepeatFor = "";
        qObj.formdata.RepeatForUnit = "";
    }
    formdata.append("RepeatUnit", qObj.formdata.RepeatUnit); //name : 일 단위, 주 단위, 월 단위(날짜), 월 단위(요일), 년 단위  value : D, W, MD, MP, Y
    formdata.append("RepeatInterval", qObj.formdata.RepeatInterval);/*일 단위 일때
                                                                    매일 반복~31일마다 반복=01~31
                                                                    매주 반복~8주마다 반복=01~08
                                                                    매월 반복~12개월마다 반복=01~12
                                                                    매년 반복~12개월마다 반복=01~10*/
    formdata.append("RepeatWeekends", qObj.formdata.RepeatWeekends);//일 단위 선택 시 에만 value : D 나머지는 ""
    if (qObj.formdata.RepeatAdjust == undefined || qObj.formdata.RepeatAdjust == "undefined" || qObj.formdata.RepeatAdjust == "") {
        qObj.formdata.RepeatAdjust = "";
    }
    formdata.append("RepeatAdjust", qObj.formdata.RepeatAdjust);/*주 반복 일때
                                                                일요일~토요일=00~06
                                                                월(날짜) 반복 일때- 1일~31일=01~31
                                                                월(요일) 반복 일때- 첫번째 일요일~마지막 금요일=1.0~5.6*/
    if (qObj.formdata.RepeatStartDate == "" || qObj.formdata.RepeatStartDate == undefined) {
        qObj.formdata.RepeatStartDate = "";
    } else {
        qObj.formdata.RepeatStartDate = qObj.formdata.RepeatStartDate + "$Z=-9$DO=0$ZX=59$ZN=Korea";
    }
    formdata.append("RepeatStartDate", qObj.formdata.RepeatStartDate);  //name: RepeatStartDate     value : 20210817T150000$Z=-9$DO=0$ZX=59$ZN=Korea
    formdata.append("RepeatHow", qObj.formdata.RepeatHow); // name: 종료,기간              value : U,F
    formdata.append("RepeatUntil", qObj.formdata.RepeatUntil); // 종료일때 name: 종료                 value : 20210831
    formdata.append("RepeatFor", qObj.formdata.RepeatFor); // 기간일때 name: 값 그대로              value : 값 그대로
    formdata.append("RepeatForUnit", qObj.formdata.RepeatForUnit); // name: 일, 주, 개월, 년        value : D, W, M, Y
    formdata.append("RepeatFromEnd", "");

    //
    //
    //본문 내용
    formdata.append("Body", qObj.formdata.body);
    //공개
    if (qObj.formdata.private == false || qObj.formdata.private == "false") {
        formdata.append("OrgConfidential", "");
        formdata.append("$PublicAccess", "1");
    }
    //비공개
    else if (qObj.formdata.private == true || qObj.formdata.private == "true") {
        formdata.append("OrgConfidential", "1");
        formdata.append("$PublicAccess", "");
    }

    //약속=0
    if (qObj.formdata.category == "0") {
        console.log("약속@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@");
        formdata.append("AppointmentType", "0");
        formdata.append("$BusyPriority", "1");
        formdata.append("tmpAlarmUnit", "M");
        formdata.append("BookFreeTime", "");
        formdata.append("PencilIn", "1");
    }
    //기념일=1
    else if (qObj.formdata.category == "1") {
        console.log("기념일@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@");
        formdata.append("AppointmentType", "1");
        formdata.append("$BusyPriority", "2");
        formdata.append("BookFreeTime", "1");
        formdata.append("PencilIn", "2");
    }
    //행사=2
    else if (qObj.formdata.category == "2") {
        console.log("행사@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@");
        formdata.append("AppointmentType", "2");
        formdata.append("$BusyPriority", "1");
        formdata.append("BookFreeTime", "");
        formdata.append("PencilIn", "1");
    }
    //회의=3
    else if (qObj.formdata.category == "3") {
        console.log("회의@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@");
        formdata.append("AppointmentType", "3");
        formdata.append("$BusyPriority", "");
        formdata.append("BookFreeTime", "");
        formdata.append("PencilIn", "1");
    }
    //리마인더=4
    else if (qObj.formdata.category == "4") {
        console.log("리마인더@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@");
        formdata.append("AppointmentType", "4");
        formdata.append("$BusyPriority", "2");
        formdata.append("BookFreeTime", "");
        formdata.append("PencilIn", "");
    }

    //첨부파일
    for (var attachInx = 0; attachInx < qObj.file.length; attachInx++) {
        // console.log("첨부 정보", qObj.file[attachInx].buffer);
        formdata.append(`HaikuUploadAttachment${attachInx}`, qObj.file[attachInx].buffer, { filename: qObj.file[attachInx].originalname });
    }
    // console.log(qObj,"@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@");
    //수정일때 바뀜
    formdata.append("s_NewBody", qObj.formdata.body);//
    formdata.append("s_NewSubject", qObj.formdata.subject);//
    formdata.append("s_NewLocation", qObj.formdata.location);
    formdata.append("$WFModified", "$B;RequiredAttendees;INetRequiredNames;AltRequiredNames;StorageRequiredNames;OptionalAttendees;INetOptionalNames;AltOptionalNames;StorageOptionalNames;FYIAttendees;INetFYINames;AltFYINames;StorageFYINames;");  // ??
    formdata.append("$WIModified", "$B;RequiredAttendees;INetRequiredNames;AltRequiredNames;StorageRequiredNames;OptionalAttendees;INetOptionalNames;AltOptionalNames;StorageOptionalNames;FYIAttendees;INetFYINames;AltFYINames;StorageFYINames;");  // ??
    formdata.append("s_ActionFlags", "18432"); // ??
    formdata.append("s_ActionInProgress", "K");
    formdata.append("s_IsPublished", "1");
    formdata.append("s_SendNotice", "1");
    formdata.append("$AlarmUnit", "");
    formdata.append("MailOptions", "1");
    // formdata.append("s_RescheduleWhich", "");
    formdata.append("s_RescheduleWhich", "1");
    formdata.append("s_WithAddRemove", "1");
    formdata.append("tmpAlarmOffset", "");
    formdata.append("tmpAlarmUnit", "");
    formdata.append("h_MeetingCommand", "22");
    if (qObj.formdata.tmpRemoveNames == undefined) {
        formdata.append("tmpRemoveNames", "");
    } else {
        formdata.append("tmpRemoveNames", qObj.formdata.tmpRemoveNames);
    }
    ///////////////////////////////////////////////////////////////////////////////////////////
    formdata.append("$Alarm", "0");
    formdata.append("$AlarmDescription", "");
    formdata.append("$AlarmMemoOptions", "");
    formdata.append("$AlarmOffset", "");
    formdata.append("$AlarmSendTo", "");
    formdata.append("$AlarmSound", "");
    formdata.append("$AlarmTime", "");
    formdata.append("$CSSMTPPreserveHTMLInDesc", "");
    formdata.append("$Disclaimed", "");
    formdata.append("$TMP_iCal_CID_List", "");
    formdata.append("%%PostCharset", "UTF-8");
    formdata.append("AlarmOnDate", "");
    formdata.append("AlarmOnTime", "");
    formdata.append("Alarms", "0");
    formdata.append("AlarmTiming", "-1");
    formdata.append("ApptUNIDURL", "");
    formdata.append("AudioVideoFlags", "");
    formdata.append("BodyImgCids", "");
    formdata.append("BodyPT", "");
    formdata.append("BookFreeTime", "");
    formdata.append("Broadcast", "");
    formdata.append("Categories", "");
    formdata.append("DeliveryPriority", "N");
    formdata.append("DeliveryReport", "B");
    formdata.append("Encrypt", "0");
    formdata.append("ExcludeFromView", "S;D;A");
    formdata.append("Form", "Appointment");
    formdata.append("h_AlarmOn", "");
    formdata.append("h_AttachmentAppleTypes", "");
    formdata.append("h_AttachmentFileItemNames", "");
    formdata.append("h_AttachmentRealNames", "");
    formdata.append("h_DestFolder", "");
    formdata.append("h_DictionaryId", "");
    formdata.append("h_EditAction", "h_Next");
    formdata.append("h_EditSceneTrail", "");
    formdata.append("h_ImageCount", "");
    formdata.append("h_Move", "");
    formdata.append("h_NoSceneTrail", "0");
    formdata.append("h_NumOfPageText", "");
    formdata.append("h_PageText", "");
    formdata.append("h_RichTextItem", "");
    formdata.append("h_SceneContext", "");
    formdata.append("h_SetCommand", "h_ShimmerSave");
    formdata.append("h_SetDeleteList", "");
    formdata.append("h_SetDeleteListCS", "");
    formdata.append("h_SetEditCurrentScene", "l_StdPageEdit");
    formdata.append("h_SetEditNextScene", "");
    formdata.append("h_SetParentUnid", "");
    formdata.append("h_SetPublishAction", "h_Publish");
    formdata.append("h_SetPublishToFolder", "");
    formdata.append("h_SetReturnURL", "[[./&Form=l_CallListener]]");
    formdata.append("h_SetSaveDoc", "1");
    formdata.append("h_SpellCheckStatus", "");
    formdata.append("h_WorkflowStage", "");
    formdata.append("hFailedUsers", "");
    formdata.append("Importance", "");
    formdata.append("In_Reply_To", "");
    formdata.append("JITUsers", "");
    formdata.append("MeetingPassword", "");
    formdata.append("NewEndDate", "");
    formdata.append("NewEndTimeZone", "");
    formdata.append("NewStartDate", "");
    formdata.append("NewStartTimeZone", "");
    formdata.append("NoDomRecips", "");
    formdata.append("NotesRecips", "");
    formdata.append("OnlineMeeting", "");
    formdata.append("OnlinePlace", "");
    formdata.append("OnlinePlaceToReserve", "");
    formdata.append("References", "");
    formdata.append("RemoveAtClose", "");
    formdata.append("Resources", "");
    formdata.append("RescheduleWhich", "");
    formdata.append("RestrictAttendence", "");
    formdata.append("ReturnReceipt", "");
    formdata.append("RoomToReserve", "");
    formdata.append("s_AllRecips", "");
    formdata.append("s_BodyCid", "");
    formdata.append("s_CidImageInfo", "");
    formdata.append("s_ConvertImage", "0");
    formdata.append("s_ConvertQuickrIconImageInfo", "");
    formdata.append("s_DataUriInfo", "");
    formdata.append("s_DisclaimerIsAdded", "0");
    formdata.append("s_EmbeddedImageInfo", "");
    formdata.append("s_IgnoreQuota", "0");
    formdata.append("s_ImageUseCidRef", "");
    formdata.append("s_LDAPGroup", "");
    formdata.append("s_MailSendReturnPage", "");
    formdata.append("s_MailViewBefore", "");
    formdata.append("s_NewAltFYIAttendees", "");
    formdata.append("s_NewAltOptionalAttendees", "");
    formdata.append("s_NewAltRequiredAttendees", "");
    formdata.append("s_NewFolderList", "");
    formdata.append("s_NewFYIAttendees", "");
    formdata.append("s_NewOptionalAttendees", "");
    formdata.append("s_NewRequiredAttendees", "");
    formdata.append("s_NewResource", "");
    formdata.append("s_NewRoom", "");
    formdata.append("s_NotesLinkIconInfo", "");
    formdata.append("s_PlainEditor", "0");
    formdata.append("s_SendAndFile", "");
    formdata.append("s_SetForwardedFrom", "0");
    formdata.append("s_SetReplyFlag", "0");
    formdata.append("s_SetRFSaveInfo", "");
    formdata.append("s_StatusUpdateCid", "");
    formdata.append("s_SubjectText", "");
    formdata.append("s_UsePlainText", "0");
    formdata.append("s_UsePlainTextAndHTML", "0");
    formdata.append("s_ViewName", "");
    formdata.append("SametimeType", "");
    formdata.append("SaveOptions", "");
    formdata.append("Sign", "0");
    formdata.append("SMIMERecips", "");
    formdata.append("SMIMESign", "");
    formdata.append("StatusUpdate", "");
    formdata.append("StatusUpdatePT", "");
    formdata.append("STConfPhone", "");
    formdata.append("STPermissions", "");
    formdata.append("STPermPresent", "");
    formdata.append("STRecordMeeting", "");
    formdata.append("STRoomName", "");
    formdata.append("STSortOrder", "");
    formdata.append("STUnyteConferenceID", "");
    formdata.append("STUnyteConferenceURL", "");
    formdata.append("SvcSelection", "");
    formdata.append("tmpAction", "");
    formdata.append("tmpAlarmTiming", "");
    formdata.append("tmpCommentIncluded", "");
    formdata.append("tmpDelegee", "");
    formdata.append("tmpdlgConfCall", "");
    formdata.append("tmpKeepPosted", "");
    formdata.append("tmpLocalizedKeywords", "");
    formdata.append("tmpRemoveResource", "");
    formdata.append("tmpRemoveRRNames", "");
    formdata.append("Topic", "");
    formdata.append("TrustInetCerts", "0");
    //기존 첨부파일이 변경 됬을 경우
    if (qObj.formdata.Detach != "") {
        editAttach(qObj);
    }
    // console.log("전송 쿠키", qObj.cookie);
    formdata.submit({
        host: config.submitHost,
        path: url,
        headers: {
            'cookie': qObj.cookie
        }
    }, function (err, resp) {
        if (err) throw err;
        console.log("statusCode : ", res.statusCode);
        if (res.statusCode == 200) {
            console.log("******************* 일정 편집 완료 *******************");
        }

        util.writeSuccess('Done', res);
    });
}

//일정 상세보기 body 정보
async function getDetailBody(qObj) {
    var url = config.host + config.schedule.detail_body;
    url = url.replace("#path#", qObj.mailPath);
    url = url.replace("#unid#", qObj.unid);

    console.log(url,"getDetailBody");
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
            console.log("**************** detailBody ************");
            // console.log(response.data);
            return response.data;
        })
        .catch((error) => {
            throw new Error(error);
        });
    result = common.urlConverter(result, qObj);

    return result;
}
//편집 시 첨부파일을 뺼경우
async function editAttach(qObj) {
    var url = config.schedule.editAttach;
    url = url.replace("#path#", qObj.mailPath);
    url = url.replace("#unid#", qObj.formdata.unid);
    // console.log("기존 첨부파일 변경됨!!!!!!!!!!!!!!!!!!!!!");
    // console.log(qObj);
    var detachArr = qObj.formdata.Detach.split(";");
    for (var detachIdx = 0; detachIdx < detachArr.length; detachIdx++) {
        var formdata = new FormData();
        // console.log(url);
        // console.log(detachArr[detachIdx],"파일 이름!!!!!!!!!!!!!!!!!!!!!!!!!!!");
        formdata.append("%%Detach.0", detachArr[detachIdx]);//기존 첨부에서 빠진 파일 이름
        formdata.append("%%Nonce", qObj.shimmerS);
        formdata.append("%%PostCharset", "UTF-8");
        // console.log(formdata);
        formdata.submit({
            host: config.submitHost,
            path: url,
            headers: {
                'cookie': qObj.cookie,
                'User-Agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36"
            }
        }, function (err, resp) {
            if (err) throw err;
            console.log("******************* 기존 첨부파일 변경 완료 *******************");
        });
    }

    return;

}
async function editInfo(qObj) {
    var url = `${config.elastic_address[config.version]}/${config.elasticPersonDB}/_search`;
    const id = config.elastic_id + ":" + config.elastic_pw;
    var authorization = Buffer.from(id, "utf8").toString("base64");

    var query = `{
        "query": {
          "match": {
            "empno": "${qObj.editSabun}"
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
    var orgObj = {};
    if (result[0]["_source"]["@form"] == "Person") {
        orgObj.id = result[0]["_source"]["@id"];
        var idArr = orgObj.id.split("/");
        if (idArr.length == 3) {
            orgObj.scheduleId = orgObj.id + "@" + idArr[2];
        } else if (idArr.length == 2) {
            orgObj.scheduleId = orgObj.id + "@" + idArr[1];
        }
        if (qObj.language == "ko") {
            orgObj.name = result[0]["_source"]["name"]["ko"] + " " + result[0]["_source"]["position"]["ko"];
            orgObj.shortname = result[0]["_source"]["name"]["ko"];
            orgObj.department = result[0]["_source"]["departmentname"]["ko"];
            orgObj.company = result[0]["_source"]["companyname"]["ko"];
        } else if (qObj.language == "en") {
            orgObj.name = result[0]["_source"]["name"]["en"] + " " + result[0]["_source"]["position"]["en"];
            orgObj.shortname = result[0]["_source"]["name"]["en"];
            orgObj.department = result[0]["_source"]["departmentname"]["en"];
            orgObj.company = result[0]["_source"]["companyname"]["en"];
        }
        orgObj.email = result[0]["_source"]["email"];
        orgObj.mobile = result[0]["_source"]["mobile"];
        orgObj.office = result[0]["_source"]["office"];
    } else {
        if (qObj.language == "ko") {
            orgObj.name = result[0]["_source"]["name"]["ko"];
            orgObj.parentname = result[0]["_source"]["departmentname"]["ko"];
        } else if (qObj.language == "en") {
            orgObj.name = result[0]["_source"]["name"]["en"];
            orgObj.parentname = result[0]["_source"]["departmentname"]["en"];
        }
    }
    orgObj.parentcode = result[0]["_source"].departmentcode;
    orgObj.companycode = result[0]["_source"].companycode;
    orgObj.mycode = result[0]["_source"].empno;
    // var photo = config.mail.photo;
    // photo = photo.replace(/#empno#/g, orgObj.mycode);
    var photoUrl = config.host + config.photo;
    photoUrl = photoUrl.replace(/#sabun#/g, orgObj.mycode);
    orgObj.photo = photoUrl;
    orgObj.kinds = result[0]["_source"]["@form"];
    orgObj.approvalInfo = result[0]["_source"].approvalInfo;
    return orgObj;
}
module.exports = { get, post, put, del };