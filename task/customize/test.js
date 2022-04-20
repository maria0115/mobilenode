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


const get = async (config, qObj, res, req) => {
    if (config.getLanguageFormat.toLowerCase().indexOf("swg6") != 0) {
        //비표준, 사이트 수정이 필요한 경우 '/task/customise/...js' 를 수정 하십시오
        var functionName = qObj.functionName;
        const site = require("./customize/" + functionName + ".js");
        site.get(config, qObj, res, req); //사이트 커스터마이즈인 경우 별도함수 호출하고 종료
        return;
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
            url = config.schedule.schedule;
            url = url.replace(/#sabun#/, qObj.sabun);
            url = url.replace(/#today#/, qObj.today);
            url = url.replace(/#start#/, qObj.today);
            url = url.replace(/#end#/, qObj.today);
        } else if (qObj.type === 'list') {
            url = config.schedule.schedule;
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
        await getDetailItem(qObj, res, req, url);
    }
    //휴일
    else if (qObj.type === 'holiday') {
        var result = await holiday(qObj);
        console.log(result, "***************휴일*****************");
        res.statusCode = 200;
        res.setHeader("Content-type", "application/json; charset=UTF-8");
        if (result.data.response.body.items) {

            res.send(JSON.stringify(result.data.response.body.items));
        } else {
            res.send(JSON.stringify({}));

        }
    }

};
const post = async (config, qObj, res, req) => {
    if (config.getLanguageFormat.toLowerCase().indexOf("swg6") != 0) {
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
    }
};
const put = async (config, qObj, res, req) => { };
const del = async (config, qObj, res, req) => {
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
async function holiday(qObj) {
    console.log("요기");
    var url =
        "http://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo";
    var queryParams =
        "?" +
        encodeURIComponent("ServiceKey") +
        "=" +
        "g096ZBtifZ1PgsemrJxwCNIhW4r4gv2ohQvgSk5udZpqFH54or/v9YqWc8ruDvoddJ63HUZSisAnEhKAsAFSEw=="; /* Service Key*/
    queryParams +=
        "&" +
        encodeURIComponent("solYear") +
        "=" +
        encodeURIComponent(qObj.year); /* */
    queryParams +=
        "&" +
        encodeURIComponent("solMonth") +
        "=" +
        encodeURIComponent(qObj.month); /* */

    return axios({
        method: "get",
        url: url + queryParams,
        headers: {
            'Access-Control-Allow-Origin': '*'
        },
    });
}
//일정 상세보기 첨부파일 정보
async function getAttachInfo(qObj) {
    var url = config.host + config.schedule.detail_attach;
    url = url.replace("#path#", qObj.mailPath);
    url = url.replace("#unid#", qObj.unid);

    var attachUrl = config.mail.download;
    attachUrl = attachUrl.replace(/#path#/, qObj.mailPath);
    attachUrl = attachUrl.replace(/#unid#/, qObj.unid);

    console.log(url);
    var result = await axios({
        method: "get",
        url: url,
        headers: {
            "Content-Type": "application/json",
            "Cookie": qObj.cookie
        },
    })
        .then((response) => {
            console.log("**************** attachInfo ************");
            // console.log(response.data);
            return response.data;
        })
        .catch((error) => {
            throw new Error(error);
        });
    result = util.strRight(result, '"item":', true);
    result = util.strLeft(result, '}).item}');
    result = "{" + result + "}";
    result = JSON.parse(result);
    var resArr = result.item;
    var attachInfoArr = [];
    try {
        for (var i = 0; i < resArr.length; i++) {
            if (resArr[i]['@name'] == "h_AttachmentNames") {
                for (var attInx = 0; attInx < resArr[i]['textlist'].text.length; attInx++) {
                    if (resArr[i]['textlist'].text[attInx]['0'] == "") {
                        attachInfoArr = [];
                    } else {
                        var attachObj = {};
                        var attachUrl = config.mail.download;
                        attachUrl = attachUrl.replace(/#fileName#/, resArr[i]['textlist'].text[attInx]['0']);
                        attachUrl = attachUrl.replace(/#path#/, qObj.mailPath);
                        attachUrl = attachUrl.replace(/#unid#/, qObj.unid);
                        attachObj.name = resArr[i]['textlist'].text[attInx]['0'];
                        attachObj.url = attachUrl;
                        attachInfoArr[attInx] = attachObj;
                    }
                }
            }
        }
    } catch (e) {
        attachInfoArr = [];
    }

    return attachInfoArr;
}
//일정 선택 삭제
async function deleteSchedule(qObj, res, req, url) {

    await axios({
        method: "post",
        url: url,
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
    await axios({
        method: "get",
        url: url,
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
//상세보기(열람함)
async function getDetailItem(qObj, res, req, url) {
    var data = await axios({
        method: "get",
        url: url,
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
    var resultObj = {};
    resultObj.unid = data["@unid"];
    resultObj.subject = data["Subject"];
    resultObj.place = data["Location"];
    resultObj.created = moment(data["@created"]).utc().format("YYYYMMDDTHHmmss");
    resultObj.startdate = data["StartDate"];
    resultObj.starttime = data["StartTime"];
    resultObj.enddate = data["EndDate"];
    resultObj.endtime = data["EndTime"];
    // resultObj.locationTimeZone = data["LocalTimeZone"];
    // console.log(data["STARTDATETIME"]);
    // console.log(moment(data["STARTDATETIME"]).format("YYYYMMDDTHHmmss"));
    resultObj.startDateTime = moment(data["STARTDATETIME"]).format("YYYYMMDDTHHmmss") + "$" + data["LocalTimeZone"];
    if (data["OrgConfidential"] == "" || data["OrgConfidential"] == undefined || data["OrgConfidential"] == "undefined") {
        resultObj.secret = "공개"
    } else if (data["OrgConfidential"] == "1") {
        resultObj.secret = "비공개"
    }

    if (data.AppointmentType == '0') {
        resultObj.category = "약속";
    } else if (data.AppointmentType == '1') {
        resultObj.category = "기념일";
    } else if (data.AppointmentType == '2') {
        resultObj.category = "행사";
    } else if (data.AppointmentType == '3') {
        resultObj.category = "회의";
    } else if (data.AppointmentType == '4') {
        resultObj.category = "리마인더";
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
//전송 전 ShimmerS 구하기
async function writeShimmerS(qObj, res, req) {
    var mailPath = await common.getMailPath(qObj);
    console.log("***************", mailPath);
    // var s = getCookie("ShimmerS");
    var d = new Date();

    var temp_str = d.getFullYear() + ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2) + "T" + ("0" + d.getHours()).slice(-2) + ("0" + d.getMinutes()).slice(-2) + "00,00Z";
    console.log("temp_str==============  ", temp_str);
    var referUrl = config.host + "/" + mailPath + "/iNotes/Mail/?OpenDocument&ui=dwa_frame&l=ko&gz&CR&MX&TS=" + temp_str + "&charset=UTF-8&charset=UTF-8&KIC&ua=ie&pt&gn";
    // var referUrl = config.host + "/" + mailPath + "?open";
    console.log(referUrl);
    await axios({
        method: "get",
        url: referUrl,
        headers: {
            "Cookie": qObj.cookie
        },
    }).then(function (response) {
        // console.log(response);
        console.log(response.headers['set-cookie']);
        qObj.cookie += " " + response.headers['set-cookie'][0];
        var cookieArr = qObj.cookie.split(";");
        for (var cookieArrIdx = 0; cookieArrIdx < cookieArr.length; cookieArrIdx++) {
            if (cookieArr[cookieArrIdx].indexOf("ShimmerS=") > -1) {
                qObj.shimmerS = util.strRight(cookieArr[cookieArrIdx], ":M&N:");
                console.log("qObj.shimmerS=============", qObj.shimmerS);
            }
        }
        return null;
    }).then((rslt) => getDocUnid(qObj, res, req));
    // });
    // await getDocUnid(qObj, res, req);
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
        headers: {
            "Content-Type": formdata.getHeaders()["content-type"],
            "Cookie": qObj.cookie,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.159 Safari/537.36"
        },
        data: formdata
    })
        .then((response) => {
            // console.log("^^^^^^^^^^^", response);
            console.log(response.data, "^^^^^^^^^^^");
            unid = util.strRight(response.data, "EHq(DhU, '");
            console.log(unid, "..........................");
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
    console.log(qObj);
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
    //작성자
    formdata.append("From", qObj.formdata.from); //CN=박광순/OU=209003/O=SIS
    formdata.append("Principal", qObj.formdata.from); //CN=박광순/OU=209003/O=SIS
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
    formdata.append("Location", qObj.formdata.location); //행사장
    formdata.append("LocalTimeZone", "Z=-9$DO=0$ZX=59$ZN=Korea");
    //*****************************************************************************
    //반복예약
    formdata.append("Repeats", qObj.formdata.Repeats); // 반복에약 없음 "", 반복예약 선택시 1
    formdata.append("RepeatUnit", qObj.formdata.RepeatUnit); //name : 일 단위, 주 단위, 월 단위(날짜), 월 단위(요일), 년 단위  value : D, W, MD, MP, Y
    formdata.append("RepeatInterval", qObj.formdata.RepeatInterval);/*일 단위 일때
    name : 매일 반복~31일마다 반복   value : 01~31
    주 단위 일때						
    name : 매주 반복~8주마다 반복    value : 01~08
    월 단위 일때
    name : 매월 반복~12개월마다 반복  value : 01~12
    년 단위 일때
    name : 매년 반복~12개월마다 반복  value : 01~10*/
    formdata.append("RepeatWeekends", qObj.formdata.RepeatWeekends);//일 단위 선택 시 에만 value : D 나머지는 ""
    formdata.append("RepeatAdjust", qObj.formdata.RepeatAdjust);/*주 반복 일때
    name : 일요일~토요일           value : 00~06
    월(날짜) 반복 일때
    name : 1일~31일             value : 01~31
    월(요일) 반복 일때
    name : 첫번째 일요일~마지막 금요일  value : 1.0~5.6*/
    formdata.append("RepeatStartDate", qObj.formdata.RepeatStartDate + "$Z=-9$DO=0$ZX=59$ZN=Korea");  //name: RepeatStartDate     value : 20210817T150000$Z=-9$DO=0$ZX=59$ZN=Korea
    formdata.append("RepeatHow", qObj.formdata.RepeatHow); // name: 종료,기간              value : U,F
    formdata.append("RepeatUntil", qObj.formdata.RepeatUntil); // 종료일때 name: 종료                 value : 20210831
    formdata.append("RepeatFor", qObj.formdata.RepeatFor); // 기간일때 name: 값 그대로              value : 값 그대로
    formdata.append("RepeatForUnit", qObj.formdata.RepeatForUnit); // name: 일, 주, 개월, 년        value : D, W, M, Y
    formdata.append("RepeatFromEnd", "");
    //*****************************************************************************
    //본문 내용
    formdata.append("Body", qObj.formdata.body); //"node TEST 입니다아아ㅏ아아아아아아ㅏ아아아ㅏ아아아아ㅏ아앙아아아"
    //공개,비공개 회의 공개 false, 비공개 true
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


    //반복예약
    //약속=0, , 행사=2, 회의=3, 리마인더 =4
    // $BusyPriority : 회의="", 약속,행사 =1 , 기념일,리마인더 =2
    // $AlarmUnit : 회의,약속,리마인더=M, 행사,기념일=D
    // tmpAlarmUnit : 회의,약속,리마인더=M, 행사,기념일=D
    // BookFreeTime : 기념일=1 나머지= ""
    // PencilIn : 기념일=2, 약속,행사,회의=1, 리마인더 ""
    // tmpAlarmOffset : 기념일,행사 = -1440, 약속,회의 = -30, 리마인더=0

    //첨부파일
    for (var attachInx = 0; attachInx < qObj.file.length; attachInx++) {
        console.log("첨부 정보", qObj.file[attachInx].buffer);
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
    formdata.append("s_SendNotice", "0");
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


    console.log("전송 쿠키", qObj.cookie);
    formdata.submit({
        host: config.mail.sendHost,
        path: url,
        headers: {
            'cookie': qObj.cookie
        }
    }, function (err, resp) {
        if (err) throw err;
        console.log("statusCode : ", res.statusCode);
        if (resp.statusCode == 200) {
            console.log("******************* 일정 등록 완료 *******************");
        }

        util.writeSuccess('Done', res);
    });
}

module.exports = { get, post, put, del };