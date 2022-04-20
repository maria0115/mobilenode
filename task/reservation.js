const util = require("../lib/util.js");
const axios = require("axios");
const parse = require('node-html-parser');
const common = require("../lib/common.js");
const cookie = require('cookie');
const cheerio = require('cheerio');
var FormData = require('form-data');
var moment = require("moment");
const https = require('https');

const agent = new https.Agent({
    rejectUnauthorized: false
});

const changecresmeeting = "/dwp/com/collab/meeting/resmeeting.nsf";
const changecmeetmng = "/dwp/com/collab/meeting/meetmng.nsf";


const get = async (config, qObj, res, req) => {
    if (config.customVersion.toLowerCase().indexOf("swg6") != 0) {
        //비표준, 사이트 수정이 필요한 경우 '/task/customise/...js' 를 수정 하십시오
        var functionName = qObj.functionName;
        const site = require("./customize/" + functionName + ".js");
        site.get(config, qObj, res, req); //사이트 커스터마이즈인 경우 별도함수 호출하고 종료
        return;
    }
    var userInfo = await common.getUserInfo(qObj);
    qObj.userInfo = userInfo;
    //언어찾기
    if (qObj.cookie !== undefined) {
        const lang = cookie.parse(qObj.cookie);
        if (lang.hasOwnProperty("language")) {
            qObj.language = cookie.parse(qObj.cookie).language;
        }
    } else {
        qObj.language = "ko";
    }
    //회사 리스트 구하기
    if (qObj.type == "companyList") {
        companyList(config, qObj, res, req);
    }
    // 사업장 category = K-SIS
    else if (qObj.type == "classList") {
        classList(config, qObj, res, req);
    }
    // 지점마다의 회의실 resource = _floor_id:_floor_id
    else if (qObj.type == "roomList") {
        roomList(config, qObj, res, req);
    }
    // 층별 회의실 category = K-SIS0001
    else if (qObj.type == "floorList") {
        floorList(config, qObj, res, req);
    }
    // 자원예약 리스트 category = 00012021-09-08, companycode =K-SIS
    else if (qObj.type == "reservationList") {
        reservationList(config, qObj, res, req);
    }
    // 상세보기
    else if (qObj.type == "detail") {
        detail(config, qObj, res, req);
    }
    // 예약 편집 폼
    else if (qObj.type == "editform") {
        editform(config, qObj, res, req);
    }
    // 예약 작성 폼
    else if (qObj.type == "writeform") {
        writeform(config, qObj, res, req);
    }
    //메인에 보여줄 오늘 잡힌 회의
    else if (qObj.type == "today") {
        today(config, qObj, res, req);
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
    //승인
    if (qObj.type == "write") {
        write(config, qObj, res, req);
    }
    // 예약 편집
    else if (qObj.type == "editItem") {
        write(config, qObj, res, req);

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
    if (qObj.type == "deleteItem") {
        deleteItem(config, qObj, res, req);
    }
};

// 회사 리스트 구하기
async function companyList(config, qObj, res, req) {
    var url = config.host + config.reservation.companyList;
    var data = await GetOpenUrl(qObj, res, req, url);

    var resultArr = [];
    for (var i = 0; i < data.length; i++) {
        if (data[i]["_type"] == "CODE") {
            var resultObj = {};
            resultObj.unid = data[i]["@unid"];
            resultObj.code = data[i]["_code"];
            resultObj.name = common.languageConverter(data[i]["_codenm"], qObj.language, ",", ":")
            resultArr.push(resultObj);
        }
    }
    util.writeSuccess(resultArr, res);
}
// 지역 리스트 구하기
async function classList(config, qObj, res, req) {
    var url = config.host + config.reservation.classList + qObj.category;
    var points = await GetOpenUrl(qObj, res, req, url);
    var result = [];
    for (var i = 0; i < points.length; i++) {
        var data = {};
        data.CorpCode = points[i].CorpCode;
        data.className = common.languageConverter(points[i]['_class_name'], qObj.language, ",", ":");
        data.code = points[i]['_code'];
        data.unid = points[i]['@unid'];
        data.cnt = points[i]['@siblings'];
        data.entryid = points[i]['@entryid'];
        result.push(data);
    }
    util.writeSuccess(result, res);

}
// 층 리스트 구하기
async function floorList(config, qObj, res, req) {
    var url = config.host + config.reservation.floorList + qObj.category;
    var points = await GetOpenUrl(qObj, res, req, url);
    var result = [];
    for (var i = 0; i < points.length; i++) {
        var data = {};
        data.unid = points[i]['@unid'];
        data.cnt = points[i]['@siblings'];
        data.floor = points[i]['$9'];
        data.floorName = common.languageConverter(points[i]['_floor_name'], qObj.language, ",", ":");
        data.code = points[i]['_floor_id'];
        result.push(data);

    }
    util.writeSuccess(result, res);

}
// 회의실 구하기
async function roomList(config, qObj, res, req) {
    var url = config.host + config.reservation.roomList + qObj.category;
    var resources = await GetOpenUrl(qObj, res, req, url);
    console.log(resources);
    var resultArr = [];
    for (var resourcesIdx = 0; resourcesIdx < resources.length; resourcesIdx++) {
        var resultObj = {};
        resultObj.isconf = resources[resourcesIdx]["isconf"];
        resultObj.unid = resources[resourcesIdx]["unid"];
        resultObj.code = resources[resourcesIdx]["id"];
        resultObj.title = common.languageConverter(resources[resourcesIdx]["title"], qObj.language, ",", ":");
        resultObj.floor = common.languageConverter(resources[resourcesIdx]["floor"], qObj.language, ",", ":");
        resultObj.seats = resources[resourcesIdx]["seats"];
        resultObj.dbpath = resources[resourcesIdx]["dbpath"];
        resultArr[resourcesIdx] = resultObj
    }
    util.writeSuccess(resultArr, res);

}
// 회의 예약 리스트 
async function reservationList(config, qObj, res, req) {
    var url = config.host + config.reservation.reservationList + qObj.category + qObj.date;
    console.log(url);
    var data = await GetOpenUrl(qObj, res, req, url);
    var resultArr = [];
    for (var dataIdx = 0; dataIdx < data.length; dataIdx++) {
        var resultObj = {};
        if (qObj.roomId == data[dataIdx]["resourceid"]) {
            resultObj.unid = data[dataIdx]["@unid"];
            resultObj.startDate = moment(data[dataIdx]["start"]).utc().format("YYYYMMDDTHHmmss");
            resultObj.startTime = data[dataIdx]["stime"];
            resultObj.endDate = moment(data[dataIdx]["end"]).utc().format("YYYYMMDDTHHmmss");
            resultObj.endTime = data[dataIdx]["etime"];
            resultObj.subject = data[dataIdx]["subject"];
            resultObj.author = common.languageConverter(data[dataIdx]["name"], qObj.language, ",", ":");
            resultObj.authorDept = common.languageConverter(data[dataIdx]["orgname"], qObj.language, ",", ":");
            resultObj.authorTel = data[dataIdx]["tel"];
            resultObj.peoples = data[dataIdx]["peoples"];
            resultObj.roomName = common.languageConverter(data[dataIdx]["resourcename"], qObj.language, ",", ":");
            resultArr.push(resultObj);
        } else {
            // resultObj.unid = data[dataIdx]["@unid"];
            // resultObj.startDate = moment(data[dataIdx]["start"]).utc().format("YYYYMMDDTHHmmss");
            // resultObj.startTime = data[dataIdx]["stime"];
            // resultObj.endDate = moment(data[dataIdx]["end"]).utc().format("YYYYMMDDTHHmmss");
            // resultObj.endTime = data[dataIdx]["etime"];
            // resultObj.subject = data[dataIdx]["subject"];
            // resultObj.author = common.languageConverter(data[dataIdx]["name"], qObj.language, ",", ":");
            // resultObj.authorDept = common.languageConverter(data[dataIdx]["orgname"], qObj.language, ",", ":");
            // resultObj.authorTel = data[dataIdx]["tel"];
            // resultObj.peoples = data[dataIdx]["peoples"];
            // resultObj.roomName = common.languageConverter(data[dataIdx]["resourcename"], qObj.language, ",", ":");
            // resultArr.push(resultObj);
        }
    }
    util.writeSuccess(resultArr, res);

}
// 상세보기
async function detail(config, qObj, res, req) {
    var url = config.host + config.reservation.detail;
    url = url.replace("#unid#", qObj.unid);
    var data = await GetOpenUrl(qObj, res, req, url);
    var data2 = data.replace(/(\s*)/g, "");
    const $ = cheerio.load(data);
    var resultObj = {};
    var author = $('input[name="MeetMasterName"]').val();
    var authorDept = $('input[name="MeetMasterOrgName"]').val();
    var isadmin = util.strRight(data2, 'isadmin:');
    isadmin = util.strLeft(isadmin, ',');
    var iswriter = util.strRight(data2, 'iswriter:');
    iswriter = util.strLeft(iswriter, ',');
    var unid = util.strRight(data2, "unid:'");
    unid = util.strLeft(unid, "',");
    resultObj.unid = unid;
    if (isadmin == "true") {
        resultObj.isAdmin = true;
    } else {
        resultObj.isAdmin = false;
    }
    if (iswriter == "true") {
        resultObj.isWriter = true;
    } else {
        resultObj.isWriter = false;
    }
    resultObj.author = common.languageConverter(author, qObj.language, ",", ":");
    if (resultObj.author == undefined) {
        resultObj.author = author;
    }
    resultObj.authorDept = common.languageConverter(authorDept, qObj.language, ",", ":");
    if (resultObj.authorDept == undefined) {
        resultObj.authorDept = authorDept;
    }
    resultObj.MeetMasterFull = $('input[name="MeetMasterFull"]').val();
    resultObj.MeetMaster = $('input[name="MeetMaster"]').val();
    resultObj.MeetMasterComTel = $('input[name="MeetMasterComTel"]').val();
    resultObj.MeetMasterOrgName = $('input[name="MeetMasterOrgName"]').val();


    var roomName = util.strRight(data, 'resourcename:"');
    roomName = util.strLeft(roomName, '"');
    resultObj.roomName = common.languageConverter(roomName, qObj.language, ",", ":");

    var floorname = util.strRight(data, 'floorname:"');
    floorname = util.strLeft(floorname, '"');
    resultObj.floorname = common.languageConverter(floorname, qObj.language, ",", ":");

    var subject = $("div.dwp-page-title").text();
    resultObj.subject = subject

    var startDate = util.strRight(data, 'startdate:"');
    startDate = util.strLeft(startDate, '"');
    resultObj.startDate = moment(startDate, "MM/DD/YYYY").utc().format("YYYYMMDDTHHmmss");

    var endDate = util.strRight(data, 'enddate:"');
    endDate = util.strLeft(endDate, '"');
    resultObj.endDate = moment(endDate, "MM/DD/YYYY").utc().format("YYYYMMDDTHHmmss");

    var startHour = util.strRight(data, 'shour:"');
    startHour = util.strLeft(startHour, '"');
    var startMin = util.strRight(data, 'smin:"');
    startMin = util.strLeft(startMin, '"');
    resultObj.startTime = startHour + ":" + startMin;

    var endHour = util.strRight(data, 'ehour:"');
    endHour = util.strLeft(endHour, '"');
    var endMin = util.strRight(data, 'emin:"');
    endMin = util.strLeft(endMin, '"');
    resultObj.endTime = endHour + ":" + endMin;
    try {
        var peoples = $('input[name="AttendeeFull"]').val();
        if (peoples == "" || peoples == undefined) {
            resultObj.peoples = [];
        } else {
            var peoplesVal = peoples.split(";");
            var peoplesArr = common.strToArr(peoples, ";", "^");
            var peoplesArr2 = [];
            for (var peoplesIdx = 0; peoplesIdx < peoplesArr.length; peoplesIdx++) {
                qObj.id = peoplesArr[peoplesIdx][3];
                var peopleObj = await peopleInfo(config, qObj, res, req);
                // console.log(peopleObj,"????????????");
                // var peoplesObj = {};
                // peoplesObj.name = common.languageConverter(peoplesArr[peoplesIdx][1], qObj.language, ",", ":");
                // peoplesObj.position = common.languageConverter(peoplesArr[peoplesIdx][6], qObj.language, ",", ":");
                // peoplesObj.dept = common.languageConverter(peoplesArr[peoplesIdx][11], qObj.language, ",", ":");
                // peoplesObj.company = common.languageConverter(peoplesArr[peoplesIdx][12], qObj.language, ",", ":");
                // peoplesObj.id = peoplesArr[peoplesIdx][3];
                // peoplesObj.val = peoplesVal[peoplesIdx];
                peoplesArr2[peoplesIdx] = peopleObj.peopleInfo;
            }
            resultObj.peoples = peoplesArr2;
        }
    } catch (e) {
        console.log(e);
        resultObj.peoples = [];
    }
    try {
        var attach = $("#Already_Attach").val();
        attach = JSON.parse(attach);
        for (var attachIdx = 0; attachIdx < attach.length; attachIdx++) {
            attach[attachIdx]["size"] = common.formatBytes(attach[attachIdx]["size"], 2);
        }
        resultObj.attachInfo = attach;
    } catch (e) {
        resultObj.attachInfo = [];
    }
    
    resultObj.bodyurl = config.bodyurl;
    
    if(config.bodyurl){
        var url = config.reservation.detailBody;
        resultObj.body = url.replace(/#unid#/, qObj.unid);
    }else{
        resultObj.body = await detailBody(config, qObj, res, req);
    }

    util.writeSuccess(resultObj, res);

}
// 상세보기 body
async function detailBody(config, qObj, res, req) {

    var url = config.host + config.reservation.detailBody;
    url = url.replace(/#unid#/, qObj.unid);

    var result = await GetOpenUrl(qObj, res, req, url);
    if (result.indexOf('<table border="1" cellspacing="2" cellpadding="4">') > -1) {
        result = util.strLeft(result, '<table border="1" cellspacing="2" cellpadding="4">');
        result = common.urlConverter(result, qObj);
        return result;
    } else {
        return result;
    }
}
// 예약 작성 폼
async function writeform(config, qObj, res, req) {
    // 얘는 작성 폼
    var openUrl = `${changecresmeeting}/wFrm01?OpenForm&did=xdialog-1&subject=&d_sdate=2021.09.20&d_shour=12&d_smin=30&d_edate=2021.09.20&d_ehour=13&d_emin=00&resourceid=${qObj.unid}`
    var formDataObj = await ConvertOpenData(qObj, res, req, config.host + openUrl);
    util.writeSuccess(formDataObj, res);
}
// 예약 편집 폼
async function editform(config, qObj, res, req) {
    // 이아래는 편집폼
    var openUrl = `${changecresmeeting}/0/${qObj.unid}?editdocument&did=xdialog-0`
    var formDataObj = await ConvertOpenData(qObj, res, req, config.host + openUrl);
    var bodyUrl = `${changecresmeeting}/0/${qObj.unid}/Body?OpenField`
    var body = await GetOpenUrl(qObj, res, req, config.host + bodyUrl);
    formDataObj.Body = body;
    util.writeSuccess(formDataObj, res);
}
// 예약 편집
async function edit(config, qObj, res, req) {
    // formDataObj = Object.assign(formDataObj,bodyDataObj);
    var formdata = new FormData();
    // 사용자 데이터 폼데이터 담기
    // var keys = Object.keys(qObj);
    // for (var i = 0; i < keys.length; i++) {
    //     var key = keys[i];
    //     formdata.append(key, qObj[key]);
    // }

    var url = config.host + config.reservation.editItem;
    // 작성
    formdata.submit({
        host: "swg60.saerom.co.kr",
        path: url,
        headers: {
            'cookie': qObj.cookie
        }
    }, function (err, resp) {
        if (err) throw err;
        // console.log("statusCode : ", res.statusCode);
        if (res.statusCode == 200) {
            console.log("******************* 자원예약 편집 완료 *******************");
        }
        util.writeSuccess('Done', res);
    });
}
// 예약 취소
function deleteItem(config, qObj, res, req) {
    var url = config.host + config.reservation.deleteItem;
    const formdata = new URLSearchParams();

    formdata.append("WQS_Agent", "wAgCmdpost");
    formdata.append("actiontype", "cancel");
    formdata.append("unid", req.body.unid);
    formdata.append("postdata", req.body.body);

    axios({
        method: "post",
        url: url,
        httpsAgent: agent,
        headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "Cookie": qObj.cookie
        },
        data: formdata
    }).then((response) => {
        util.writeSuccess('Done', res);
        return;
    });

}
// 예약하기
async function write(config, qObj, res, req) {
    // 회의실 불러오기
    var formdata = new FormData();

    // 제목
    formdata.append("Subject", qObj.formdata.Subject);

    // 회의 주선자 full정보 : S^ko:배선일,en:Bae Sunil^209002^배선일/209002/SIS^K-SIS_300031^K-SIS_200001^ko:파트원,en:파트원^K-SIS_06^ko:수석,en:수석^K-SIS_20^K-SIS^ko:솔루션팀,en:솔루션팀^ko:새롬정보,en:Saerom
    formdata.append("MeetMasterFull", qObj.formdata.MeetMasterFull);

    //배선일/209002/SIS
    formdata.append("MeetMaster", qObj.formdata.MeetMaster);

    //ko:배선일,en:Bae Sunil
    formdata.append("MeetMasterName", qObj.formdata.MeetMasterName);

    //02-2105-2561 /
    formdata.append("MeetMasterComTel", qObj.formdata.MeetMasterComTel);

    //ko:솔루션팀,en:솔루션팀
    formdata.append("MeetMasterOrgName", qObj.formdata.MeetMasterOrgName);

    //K-SIS
    formdata.append("MeetMasterComCode", qObj.formdata.MeetMasterComCode);

    //209002
    formdata.append("MeetMasterEmpNo", qObj.formdata.MeetMasterEmpNo);

    // 일반 : "D", 반복예약 : "R"
    formdata.append("ScheduleType", qObj.formdata.ScheduleType);
    formdata.append("ScheduleType_Nm", "");

    // 반복예약할때 시작 날짜 2021-11-19 00:00:00 ZE9
    formdata.append("ScheduleDate", qObj.formdata.ScheduleDate);

    // 반복예약할때 끝 날짜 2021-11-19 00:00:00 ZE9
    formdata.append("ScheduleDate_End", qObj.formdata.ScheduleDate_End);

    // 시작 시간  18
    formdata.append("SHour", qObj.formdata.SHour);

    // 시작 분  00
    formdata.append("SMin", qObj.formdata.SMin);

    // 끝 시간  20
    formdata.append("EHour", qObj.formdata.EHour);

    // 끝 분 00
    formdata.append("EMin", qObj.formdata.EMin);

    // 기본 : "D", 반복예약시 : 일단위="D", 주단위="W", 격주단위="MP", 월단위="M"
    formdata.append("RepeatUnit", qObj.formdata.RepeatUnit);
    formdata.append("RepeatUnit_Nm", "")

    // 기본 : "", 일단위 선택하고 평일만 선택시 :"", 주말포함 : "Y"
    formdata.append("EveryWeekday", qObj.formdata.EveryWeekday);
    formdata.append("EveryWeekday_Nm", "");

    //기본값 : 1 , 격주 단위일때 : 매월 1,3 = 1 매월 2.4 = 2
    formdata.append("RepeatAdjust_W2", qObj.formdata.RepeatAdjust_W2);
    formdata.append("RepeatAdjust_W2_Nm", "");

    //기본값 : 1, 매월 일때 : 1~마지막주 = 1~5
    formdata.append("RepeatAdjust_W1", qObj.formdata.RepeatAdjust_W1);
    formdata.append("RepeatAdjust_W1_Nm", "");

    //기본값 : 1 주단위 선택시 일요일~토요일 = 1~7
    formdata.append("WeekDay", qObj.formdata.WeekDay);
    formdata.append("WeekDay_Nm", "");

    // 참석자 full정보 S^ko:정상혁,en:정상혁,zh:정상혁,ja:정상혁^220007^정상혁/220007/SIS^K-SIS_300031^K-SIS_200001^ko:파트원,en:파트원,zh:파트원,ja:파트원^K-SIS_06^ko:파트원,en:파트원,zh:파트원,ja:파트원^K-SIS_06^K-SIS^ko:솔루션팀,en:솔루션팀,zh:솔루션팀,ja:솔루션팀^ko:새롬정보,en:Saerom,zh:새롬정보,ja:새롬정보^ksis^D;S^ko:강예은,en:강예은,zh:강예은,ja:강예은^220006^강예은/220006/SIS^K-SIS_300031^K-SIS_200001^ko:파트원,en:파트원,zh:파트원,ja:파트원^K-SIS_06^ko:파트원,en:파트원,zh:파트원,ja:파트원^K-SIS_06^K-SIS^ko:솔루션팀,en:솔루션팀,zh:솔루션팀,ja:솔루션팀^ko:새롬정보,en:Saerom,zh:새롬정보,ja:새롬정보^ksis^D
    formdata.append("AttendeeFull", qObj.formdata.AttendeeFull);

    // 참석자 notesid 정상혁/220007/SIS;강예은/220006/SIS
    formdata.append("Attendee", qObj.formdata.Attendee);

    // 본문
    formdata.append("Body", qObj.formdata.Body);
    formdata.append("Body_ko", "");

    // 간단 본문
    formdata.append("bSummary", qObj.formdata.Body);

    // 알림 메일 발송 할 건지  "Y",
    try {
        if (qObj.formdata.isMailling !== "" || qObj.formdata.isMailling !== undefined) {
            formdata.append("isMailling", qObj.formdata.isMailling);
            formdata.append("isMailling_Nm", "");
        }
    } catch (e) {

    }
    //첨부파일
    for (var attachInx = 0; attachInx < qObj.file.length; attachInx++) {
        //console.log("첨부 정보", qObj.file[attachInx].buffer);
        formdata.append("%%File", qObj.file[attachInx].buffer, { filename: qObj.file[attachInx].originalname });
    }
    try {
        var detachArr = qObj.formdata.Detach.split(";");
        for (var detachIdx = 0; detachIdx < detachArr.length; detachIdx++) {
            formdata.append("%%Detach", detachArr[detachIdx]); //기존 첨부에서 빠진 파일 이름
        }
    } catch (e) {
        formdata.append("%%Detach", ""); //기존 첨부에서 빠진 파일 이름
    }

    ////////////////////////////////////////////////////////////////
    formdata.append("__Click", "0");
    formdata.append("ApplCode", "meeting");
    formdata.append("docstatus", "reg");
    formdata.append("actiontype", "save");
    formdata.append("AutoUNID", "");
    formdata.append("imgDataURL", "");
    formdata.append("mediaUrl", "");
    formdata.append("ChkXSSFNM", "Subject;qsearch;DisName;ScheduleDate;ScheduleDate_End;qsearch");
    formdata.append("thumbPos", "");
    formdata.append("thumbImgUrl", "");
    formdata.append("MIMESweeper", "1");
    formdata.append("DisName", "");
    formdata.append("%%Surrogate_SHour", "1");
    formdata.append("%%Surrogate_SMin", "1");
    formdata.append("%%Surrogate_EHour", "1");
    formdata.append("%%Surrogate_EMin", "1");
    formdata.append("qsearch", "");
    formdata.append("Multi_Attach_Type", "D");
    formdata.append("Multi_Attach_DBPath", "Error");
    formdata.append("Multi_Attach_Form", "fmUpload");
    formdata.append("Multi_Attach_DocID", "");
    formdata.append("Multi_Attach_DeleteFile", "");
    formdata.append("Multi_Attach_Files", "");
    formdata.append("Multi_Attach_Info", "");
    formdata.append("Multi_Attach_SortFiles", "");
    formdata.append("Multi_Attach_SortFilesSize", "");
    formdata.append("Already_Attach", "");
    formdata.append("Multi_Attach_BodyEmd", "0");
    formdata.append("attach_btn", "");
    formdata.append("EveryWeekday", "Y");


    // 사용자 데이터 폼데이터 담기
    // var keys = Object.keys(qObj);
    // for (var i = 0; i < keys.length; i++) {
    //     var key = keys[i];
    //     formdata.append(key, qObj[key]);
    // }
    var url = "";
    if (qObj.type == "editItem") {
        url = config.host + config.reservation.editItem;
        url = url.replace("#unid#", qObj.formdata.unid);
    } else {
        url = config.host + config.reservation.write + qObj.formdata.roomCode;
    }
    console.log(url);
    // 작성
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
            if (response.status == 200) {
                console.log("******************* 회의실 예약 완료 *******************");
                util.writeSuccess('Done', res);
            } else {
                console.log(response);
                return;
            }
        })
        .catch((error) => {
            throw new Error(error);
        });
}
// openData converting
async function ConvertOpenData(qObj, res, req, url) {
    var openData = await GetOpenUrl(qObj, res, req, url);
    const $ = parse.parse(openData);
    var input = $.querySelectorAll("input");
    var formDataObj = {};
    input.forEach(function (arg) {
        var value = "";
        if (arg.rawAttributes.value) {
            value = arg.rawAttributes.value;
        }
        var name = "";
        if (arg.rawAttributes.name) {
            name = arg.rawAttributes.name;
        } else {
            name = arg.rawAttributes.id;
        }
        formDataObj[name] = value;
    });

    var div = $.querySelectorAll("div");
    div.forEach(function (arg) {
        // var value = arg.rawAttributes;
        if (arg.rawAttributes['data-xlang-name'] && arg.rawAttributes['data-xlang-value']) {

            formDataObj[arg.rawAttributes['data-xlang-name']] = arg.rawAttributes['data-xlang-value'];
        } else if (arg.rawAttributes['data-xlang-code']) {
            var v = arg.nextElementSibling
            if (v.rawAttributes.class = "dwp-value") {
                formDataObj[arg.rawAttributes['data-xlang-code']] = v.textContent;
            }

        }
    });

    return formDataObj;

}
// openurl
async function GetOpenUrl(qObj, res, req, url) {
    return await axios({
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
}
// 참석자 정보 구하기
async function peopleInfo(config, qObj, res, req) {
    var url = `${config.elastic_address[config.version]}/${config.elasticPersonDB}/_search`;
    const id = config.elastic_id + ":" + config.elastic_pw;
    var authorization = Buffer.from(id, "utf8").toString("base64");
    var query = `{
            "query": {
              "match": {
                "@id": "${qObj.id}"
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
    var resultObj = {};
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
            if (qObj.language == "ko") {
                orgObj.name = result[orgInx]["_source"]["name"]["ko"] + " " + result[orgInx]["_source"]["position"]["ko"];
                orgObj.shortname = result[orgInx]["_source"]["name"]["ko"];
                orgObj.department = result[orgInx]["_source"]["departmentname"]["ko"];
                orgObj.company = result[orgInx]["_source"]["companyname"]["ko"];
            } else if (qObj.language == "en") {
                orgObj.name = result[orgInx]["_source"]["name"]["en"] + " " + result[orgInx]["_source"]["position"]["en"];
                orgObj.shortname = result[orgInx]["_source"]["name"]["en"];
                orgObj.department = result[orgInx]["_source"]["departmentname"]["en"];
                orgObj.company = result[orgInx]["_source"]["companyname"]["en"];
            }
            orgObj.email = result[orgInx]["_source"]["email"];
            orgObj.mobile = result[orgInx]["_source"]["mobile"];
            orgObj.office = result[orgInx]["_source"]["office"];
        } else {
            if (qObj.language == "ko") {
                orgObj.name = result[orgInx]["_source"]["name"]["ko"];
                orgObj.parentname = result[orgInx]["_source"]["departmentname"]["ko"];
            } else if (qObj.language == "en") {
                orgObj.name = result[orgInx]["_source"]["name"]["en"];
                orgObj.parentname = result[orgInx]["_source"]["departmentname"]["en"];
            }
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
        orgObj.notesId = result[orgInx]["_id"];

        // orgArr[orgInx] = orgObj;
        resultObj.peopleInfo = orgObj;
    }
    return resultObj;
}
async function today(config, qObj, res, req) {

    var resultArr = [];
    //회사 코드 구하기
    var companyUrl = config.host + config.reservation.companyList;
    var companyData = await GetOpenUrl(qObj, res, req, companyUrl);
    for (var i = 0; i < companyData.length; i++) {
        if (companyData[i]["_type"] == "CODE") {
            //지역 코드 구하기
            var classUrl = config.host + config.reservation.classList + companyData[i]["_code"];
            var classData = await GetOpenUrl(qObj, res, req, classUrl);

            for (var j = 0; j < classData.length; j++) {
                //내 모든 회의 리스트 구하기
                var url = config.host + config.reservation.today + classData[j]["_code"] + qObj.date + qObj.userInfo.empno;
                var data = await GetOpenUrl(qObj, res, req, url);

                for (var dataIdx = 0; dataIdx < data.length; dataIdx++) {
                    var resultObj = {};
                    resultObj.unid = data[dataIdx]["@unid"];
                    resultObj.startDate = moment(data[dataIdx]["start"]).utc().format("YYYYMMDDTHHmmss");
                    resultObj.startTime = data[dataIdx]["stime"];
                    resultObj.endDate = moment(data[dataIdx]["end"]).utc().format("YYYYMMDDTHHmmss");
                    resultObj.endTime = data[dataIdx]["etime"];
                    resultObj.subject = data[dataIdx]["subject"];
                    resultObj.author = common.languageConverter(data[dataIdx]["name"], qObj.language, ",", ":");
                    resultObj.authorDept = common.languageConverter(data[dataIdx]["orgname"], qObj.language, ",", ":");
                    resultObj.authorTel = data[dataIdx]["tel"];
                    resultObj.peoples = data[dataIdx]["peoples"];
                    resultObj.roomName = common.languageConverter(data[dataIdx]["resourcename"], qObj.language, ",", ":");
                    resultArr.push(resultObj);
                }
            }
        }
    }
    util.writeSuccess(resultArr, res);
}
async function today2(config, qObj, res, req) {
    var url = config.host + config.reservation.today;
    url = url.replace("#sabun", qObj.userInfo.empno);
    console.log(url);
    var data = await GetOpenUrl(qObj, res, req, url);
    var resultArr = [];
    for (var i = 0; i < data.length; i++) {
        var resultObj = {};
        resultObj.author = common.languageConverter(data[i]["_author"], qObj.language, ",", ":");
        resultObj.room = common.languageConverter(data[i]["_resourcename"], qObj.language, ",", ":");
        resultObj.floor = common.languageConverter(data[i]["_floorname"], qObj.language, ",", ":");
        resultObj.subject = data[i]["_subject"];
        resultObj.created = moment(data[i]["_createdate"]).utc().format("YYYYMMDDTHHmmss");
        var timeArr = data[i]["_restime"].split("~");
        resultObj.startTime = timeArr[0];
        resultObj.endTime = timeArr[1];
        try {
            var dateArr = data[i]["_resdate"].split("~");
            if (dateArr[1] == undefined) {
                resultObj.startDate = data[i]["_resdate"];
                resultObj.endDate = data[i]["_resdate"];
            } else {
                resultObj.startDate = dateArr[0];
                resultObj.endDate = dateArr[1];
            }
        } catch (e) {
            resultObj.startDate = data[i]["_resdate"];
            resultObj.endDate = data[i]["_resdate"];
        }
        resultObj.unid = data[i]["@unid"];
        resultArr[i] = resultObj;
    }
    util.writeSuccess(resultArr, res);
}

module.exports = { get, post, put, del };