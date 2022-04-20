const util = require("../lib/util.js");
const logger = require("../lib/log.js");
const config = require("../config/config.json");
const common = require("../lib/common.js");
const path = require("path");
const syncRequest = require("sync-request");
const axios = require("axios");
const cheerio = require('cheerio');
var moment = require("moment");
var urlencode = require('urlencode');
const { approval } = require("../config/dev.js");
var FormData = require('form-data');
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
    //사용자 사번 찾기
    var readerArr = qObj.readers.split("/"); //[ 'CN=박광순', 'OU=209003', 'O=SIS' ]
    for (var readerInx = 0; readerInx < readerArr.length; readerInx++) {
        if (readerArr[readerInx].indexOf("OU=") > -1) {
            var sabun = util.strRight(readerArr[readerInx], 'OU='); //209003
            qObj.sabun = sabun;
        }
    }
    //사용자 정보 구하기
    var userInfo = await common.getUserInfo(qObj);
    qObj.userInfo = userInfo;
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
    var url = config.host + config.getLanguages;
    url = url.replace("$language$", language);
    url = url.replace("$key$", "mobile.approval");
    console.log(url);
    //결재 중 문서
    if (qObj.type === 'approving') {
        //결재 중 문서
        var appresult = await axios({
            method: "get",
            url: url,
            httpsAgent: agent,
            headers: {
                "Content-Type": "application/json",
                "Cookie": qObj.cookie
            },
        }).then((response) => {
            return response;
        });
        var langObj = await getApprovalLanguages(qObj, url, appresult.data);
        qObj.langObj = langObj;
        var companyCode = await getCompanyCode(qObj, req);
        qObj.companyCode = companyCode;
        await approving(config, qObj, res, req);

    }
    //결재 할 문서
    else if (qObj.type === 'approve') {
        //결재 할 문서        
        approve(config, qObj, res, req);
    }
    //작성중(임시저장) 문서
    else if (qObj.type === 'draft') {
        var url = config.host + config.approval.draft
        url = url.replace("#size#", qObj.size);
        url = url.replace("#page#", qObj.page);
        url = url.replace("#sabun#", qObj.sabun);
        url = url.replace("#comalias#", qObj.userInfo.comalias);

        if (qObj.filter == "all") {
            url += `&sortcolumn=_created&sortorder=descending&search=([AuthorEmpNo] Contains ${qObj.sabun}) and (*${qObj.keyword}*)`;
        } else if (qObj.filter == "subject") {
            url += `&sortcolumn=_created&sortorder=descending&search=([AuthorEmpNo] Contains ${qObj.sabun}) and ([Subject] contains ${qObj.keyword})`;
        } else if (qObj.filter == "formTitle") {
            url += `&sortcolumn=_created&sortorder=descending&search=([AuthorEmpNo] Contains ${qObj.sabun}) and ([sFormTitle] contains ${qObj.keyword})`;
        }
        url = encodeURI(url);

        await getItemList(config, qObj, res, req, url);
    }
    //반려된 문서
    else if (qObj.type === 'reject') {
        var url = config.host + config.approval.reject
        url = url.replace("#size#", qObj.size);
        url = url.replace("#page#", qObj.page);
        url = url.replace("#sabun#", qObj.sabun);

        if (qObj.filter == "all") {
            url += `&sortcolumn=_created&sortorder=descending&search=([AuthorEmpNo] Contains ${qObj.sabun}) and (*${qObj.keyword}*)`;
        } else if (qObj.filter == "subject") {
            url += `&sortcolumn=_created&sortorder=descending&search=([AuthorEmpNo] Contains ${qObj.sabun}) and ([Subject] contains ${qObj.keyword})`;
        } else if (qObj.filter == "formTitle") {
            url += `&sortcolumn=_created&sortorder=descending&search=([AuthorEmpNo] Contains ${qObj.sabun}) and ([sFormTitle] contains ${qObj.keyword})`;
        }
        url = encodeURI(url);
        await getItemList(config, qObj, res, req, url);
    }
    //완료함 (개인함)
    else if (qObj.type === 'success_my') {
        var url = config.host + config.approval.success_my
        // url = url.replace(/#comalias#/g, qObj.userInfo.comalias);
        var sabun = `[{"${config.smartView_filterName1}":"${qObj.sabun}"}]`
        var comalias = `[{"authorcomalias":"${qObj.userInfo.comalias}"}]`
        // sabun = urlencode(sabun);
        url = url.replace("#size#", qObj.size);
        url = url.replace("#page#", qObj.page);
        url = url.replace("#sabun#", sabun);
        url = url.replace("#comalias#", comalias);
        url = url.replace("#application#", config.smartView_applicationName);

        await getSuccessList(config, qObj, res, req, url);
    }
    //완료함 (부서함)
    else if (qObj.type === 'success_dept') {
        var url = config.host + config.approval.success_dept
        // url = url.replace(/#comalias#/g, qObj.userInfo.comalias);
        var comalias = `[{"authorcomalias":"${qObj.userInfo.comalias}"}]`
        var dept = "";
        dept = `[{"authororgcode":"${userInfo["departmentcode"]}"}]`
        // dept = urlencode(dept);
        url = url.replace("#size#", qObj.size);
        url = url.replace("#page#", qObj.page);
        url = url.replace("#dept#", dept);
        url = url.replace("#comalias#", comalias);
        url = url.replace("#application#", config.smartView_applicationName);

        await getSuccessList(config, qObj, res, req, url);
    }
    //완료함 (일자별)
    else if (qObj.type === 'success_date') {
        var url = config.host + config.approval.success_date;
        var comalias = `[{"authorcomalias":"${qObj.userInfo.comalias}"}]`
        // url = url.replace(/#comalias#/g, qObj.userInfo.comalias);
        url = url.replace("#size#", qObj.size);
        url = url.replace("#page#", qObj.page);
        url = url.replace("#comalias#", comalias);
        url = url.replace("#application#", config.smartView_applicationName);

        await getSuccessList(config, qObj, res, req, url);
    }
    //결재 양식 전체 리스트
    else if (qObj.type === 'formList_all') {
        var url = config.host + config.approval.formList_all;
        // console.log(userInfo["companycode"]);
        url = url.replace("#companycode#", userInfo["companycode"]);
        await getFormListAll(config, qObj, res, req, url);
    }
    //최근 작성한 결재 양식
    else if (qObj.type === 'formList_recent') {
        var url = config.host + config.approval.formList_recent;
        url = url.replace("#category#", qObj.sabun + userInfo["companycode"]);
        await getFormListRecent(config, qObj, res, req, url);
    }
    //자주 사용하는 결재서식
    else if (qObj.type === 'formList_favorite') {
        var url = config.host + config.approval.formList_favorite;
        url = url.replace("#category#", qObj.sabun);
        await getFormListFavorite(config, qObj, res, req, url);
    }
    //상세보기
    else if (qObj.type === 'detail') {
        var appresult = await axios({
            method: "get",
            url: url,
            httpsAgent: agent,
            headers: {
                "Content-Type": "application/json",
                "Cookie": qObj.cookie
            },
        }).then((response) => {
            return response;
        });
        var langObj = await getApprovalLanguages(qObj, url, appresult.data);
        qObj.langObj = langObj;
        qObj.formOption = true;
        qObj.config = config;
        qObj.res = res;
        qObj.req = req;
        qObj.url = url;
        getDataInfo_axios(config, qObj, res, req);
        // await getDetailItem(config, qObj, res, req, url);
    }
    //결재 양식 옵션 구하기
    else if (qObj.type === 'formSetting') {
        formSetting(config, qObj, res, req);
    }
    // 에이스테크 - 근태승인신청서 양식 가져오기
    else if (qObj.type === 'formOption') {
        qObj.formOption = false;
        getDataInfo_axios(config, qObj, res, req);
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
    var userInfo = await common.getUserInfo(qObj);
    qObj.userInfo = userInfo;
    //승인
    if (qObj.type == "agreeNreject") {
        agreeNreject(config, qObj, res, req);
    } else if (qObj.type == "write") {
        write(config, qObj, res, req);
    } else if (qObj.type == "edit") {
        editItem(config, qObj, res, req);
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
//결재 중 문서
async function approving(config, qObj, res, req) {
    //결재 중 문서
    // console.log(qObj);
    var url = config.host + config.approval.approving;
    var sabun = qObj.sabun;
    var language = qObj.language;
    url = url.replace(/#size#/, qObj.size);
    url = url.replace(/#page#/, qObj.page);
    url = url.replace(/#sabun#/, sabun);

    if (qObj.filter == "all") {
        url += `&sortcolumn=_startdate&sortorder=descending&search=(([sMutualRequest] contains "${qObj.sabun}" OR [sPrevAppReaders1] contains "${qObj.sabun}" OR [sPrevAppReaders2] contains "${qObj.sabun}" OR [sRevSendDept] contains "${qObj.sabun}" OR [DocRegionCode] contains "${qObj.sabun}" OR [AuthorComCode] contains "${qObj.sabun}")) and (${qObj.keyword})`;
    } else if (qObj.filter == "subject") {
        url += `&sortcolumn=_startdate&sortorder=descending&search=(([sMutualRequest] contains "${qObj.sabun}" OR [sPrevAppReaders1] contains "${qObj.sabun}" OR [sPrevAppReaders2] contains "${qObj.sabun}" OR [sRevSendDept] contains "${qObj.sabun}" OR [DocRegionCode] contains "${qObj.sabun}" OR [AuthorComCode] contains "${qObj.sabun}")) and ([Subject] contains ${qObj.keyword})`;
    } else if (qObj.filter == "formTitle") {
        url += `&sortcolumn=_startdate&sortorder=descending&search=(([sMutualRequest] contains "${qObj.sabun}" OR [sPrevAppReaders1] contains "${qObj.sabun}" OR [sPrevAppReaders2] contains "${qObj.sabun}" OR [sRevSendDept] contains "${qObj.sabun}" OR [DocRegionCode] contains "${qObj.sabun}" OR [AuthorComCode] contains "${qObj.sabun}")) and ([sFormTitle] contains ${qObj.keyword})`;
    } else if (qObj.filter == "authorName") {
        url += `&sortcolumn=_startdate&sortorder=descending&search=(([sMutualRequest] contains "${qObj.sabun}" OR [sPrevAppReaders1] contains "${qObj.sabun}" OR [sPrevAppReaders2] contains "${qObj.sabun}" OR [sRevSendDept] contains "${qObj.sabun}" OR [DocRegionCode] contains "${qObj.sabun}" OR [AuthorComCode] contains "${qObj.sabun}")) and ([AuthorName] contains ${qObj.keyword})`;
    } else if (qObj.filter == "sCurFullList") {
        url += `&sortcolumn=_startdate&sortorder=descending&search=(([sMutualRequest] contains "${qObj.sabun}" OR [sPrevAppReaders1] contains "${qObj.sabun}" OR [sPrevAppReaders2] contains "${qObj.sabun}" OR [sRevSendDept] contains "${qObj.sabun}" OR [DocRegionCode] contains "${qObj.sabun}" OR [AuthorComCode] contains "${qObj.sabun}")) and ([sCurFullList] contains ${qObj.keyword})`;
    } else if (qObj.filter == "date") {
        url += `&sortcolumn=_startdate&sortorder=descending&search=(([sMutualRequest] contains "${qObj.sabun}" OR [sPrevAppReaders1] contains "${qObj.sabun}" OR [sPrevAppReaders2] contains "${qObj.sabun}" OR [sRevSendDept] contains "${qObj.sabun}" OR [DocRegionCode] contains "${qObj.sabun}" OR [AuthorComCode] contains "${qObj.sabun}")) and (([sStartDate] >= ${qObj.startDate} and [sStartDate] <= ${qObj.endDate}))`;
    }
    url = encodeURI(url);
    var ret = [];
    console.log(url);
    var rows = await axios({
        method: "get",
        url: url,
        httpsAgent: agent,
        headers: {
            "Content-Type": "application/json",
            "Cookie": qObj.cookie
        },
    })
        .then((response) => {
            console.log("****************approving*******************");
            return response.data;
        })
        .catch((error) => {
            throw new Error(error);
        });
    // console.log(rows);
    if (rows == null | rows == "" | rows == undefined | rows == [] | rows == "undefined") {
        rows = [];
        util.writeSuccess(rows, res);
        return;
    }
    for (var i = 0; i < rows.length; i++) {
        var retObj = {};
        var row = rows[i];
        var arrStatus = row["_appinginfo"].split('/');
        var approved = 0;
        var totalApprover = 0;
        try {
            approved = arrStatus[0] * 1; // 기완료된 결재자 수 
        } catch (e) {
        }
        retObj.approved = approved; // 기완료된 결재자 수 

        try {
            totalApprover = arrStatus[1] * 1; // 결재자 총 수
        } catch (e) {
        }
        retObj.totalApprover = totalApprover; // 결재자 총 수

        qObj.openurl = row["_openurl"];
        //양식 다국어 처리 "ko:품의서,en:Consultation,zh:禀议书,hu:Consultation,in:Consultation",
        retObj.category = common.languageConverter(row._formtitle, qObj.language, ",", ":");
        // console.log(row);
        qObj.unid = row._oriunid.split('_')[1];
        retObj.unid = qObj.unid;
        if (row["_attach"] == "true") {
            retObj.attach = true;
        } else if (row["_attach"] == "false") {
            retObj.attach = false;
        } else {
            retObj.attach = row["_attach"];
        }


        //////////////////////////////////////////////////////////////////////////////
        //결재정보 구하기
        // console.log(row["_curusersfull"],"????????????????????????");
        var appListArr = common.strToArr(row["_approvalinfo"], ";", "^"); // 결재선 정보
        var sCurFullListArr;
        try {
            sCurFullListArr = common.strToArr(row["_curusersfull"], ";", "^"); //현결재자

        } catch (e) {
            sCurFullListArr = common.strToArr(row["_curusersfull"][0], ";", "^"); //현결재자
        }
        var commentSum = common.strToArr(row["_comment"], "!@#$", "!@"); //현결재자
        // var commentSum = common.strToArr(row["_comment"], "†¶", "†"); //현결재자

        // console.log(appListArr);
        var commentArr = commentSum.slice(0, appListArr.length);
        var commentArr2;
        if (appListArr.length < commentArr.length) {
            commentArr2 = commentSum.slice(appListArr.length, commentArr.length);
        } else {
            commentArr2 = [];
        }

        var approvalInfoArr = [];
        var count = 0;
        for (var appListArrIdx = 0; appListArrIdx < appListArr.length; appListArrIdx++) {
            var approvalObj = {};
            var appList = appListArr[appListArrIdx]; //결재선 하나 정보
            var comment = commentArr[appListArrIdx]; //코멘트 하나
            // console.log(appList);
            if (comment != undefined && comment[0].indexOf("mutual") == -1) {
                if (appList[4] == comment[1]) {
                    approvalObj.created = moment(comment[5]).utc().format("YYYYMMDDTHHmmss");
                    approvalObj.body = comment[6];
                } else {
                    for (var commentArrIdx = 0; commentArrIdx < commentArr.length; commentArrIdx++) {
                        var comment = commentArr[commentArrIdx];
                        if (appList[4] == comment[1]) {
                            approvalObj.created = moment(comment[5]).utc().format("YYYYMMDDTHHmmss");
                            approvalObj.body = comment[6];
                            break;
                        } else {
                            approvalObj.created = "";
                            approvalObj.body = "";
                        }
                    }
                }
            } else if (comment != undefined && comment[0].indexOf("mutual") > -1) {
                approvalObj.created = moment(comment[5]).utc().format("YYYYMMDDTHHmmss");
                approvalObj.body = comment[6];
            } else {
                approvalObj.created = "";
                approvalObj.body = "";
            }



            for (var sCurFullListArrIdx = 0; sCurFullListArrIdx < sCurFullListArr.length; sCurFullListArrIdx++) {
                var sCurFullList = sCurFullListArr[sCurFullListArrIdx]; //현 결재자 ""
                if (appList[1] == sCurFullList[1] && appList[5] == sCurFullList[5]) {
                    approvalObj.approval = true;
                    break;
                } else {
                    approvalObj.approval = false;
                }
            }
            //####################################################################################
            var approvalKind = appList[0]; //AP:결재,AG:협조
            approvalKind = approvalKind.replace(/ /g, "");
            if (approvalKind.indexOf('!@') > -1) {
                approvalKind = util.strLeft(approvalKind, '!@'); //AG_P!@AG_A===>  AG_P
            }

            var approvalKindlang = '';
            var arrApprovalkind = qObj.langObj.type.list;

            for (var kindIndex = 0; kindIndex < arrApprovalkind.length; kindIndex++) {
                var objApprovalkind = arrApprovalkind[kindIndex];
                var kindVal = objApprovalkind[approvalKind];
                if (typeof (kindVal) === undefined || typeof (kindVal) === "undefined" || kindVal === null || kindVal === "") {

                } else {
                    approvalKindlang = kindVal;
                    break;
                }
            }

            if (approvalKind == "AP" && appListArrIdx == 0) {
                var firstAP = qObj.langObj.type.firstAP;
                if (typeof (firstAP) === undefined || typeof (firstAP) === "undefined" || firstAP === null || firstAP === "") {

                } else {
                    approvalKindlang = firstAP;
                }
            }
            approvalObj.approvalKind = approvalKindlang;
            //####################################################################################
            var photoUrl = config.photo;
            photoUrl = photoUrl.replace(/#sabun#/g, appList[4]);
            approvalObj.photo = photoUrl;
            approvalObj.author = common.languageConverter(appList[3], qObj.language, ",", ":");
            approvalObj.authorposition = common.languageConverter(appList[8], qObj.language, ",", ":");
            approvalObj.authordept = common.languageConverter(appList[13], qObj.language, ",", ":");

            approvalInfoArr[count] = approvalObj;
            count++;
        }

        var appListArr2 = common.strToArr(row["_approvaldept"], ";", "^"); // 결재선 정보
        if (appListArr2 != "") {
            for (var appListArrIdx = 0; appListArrIdx < appListArr2.length; appListArrIdx++) {
                var approvalObj = {};
                var appList = appListArr2[appListArrIdx];
                var comment = commentArr2[appListArrIdx]; //코멘트 하나

                if (comment != undefined && comment[0].indexOf("mutual") == -1) {
                    if (appList[4] == comment[1]) {
                        approvalObj.created = moment(comment[5]).utc().format("YYYYMMDDTHHmmss");
                        approvalObj.body = comment[6];
                    } else {
                        for (var commentArrIdx = 0; commentArrIdx < commentArr.length; commentArrIdx++) {
                            var comment = commentArr[commentArrIdx];
                            if (appList[4] == comment[1]) {
                                approvalObj.created = moment(comment[5]).utc().format("YYYYMMDDTHHmmss");
                                approvalObj.body = comment[6];
                                break;
                            } else {
                                approvalObj.created = "";
                                approvalObj.body = "";
                            }
                        }
                    }
                } else if (comment != undefined && comment[0].indexOf("mutual") > -1) {
                    approvalObj.created = moment(comment[5]).utc().format("YYYYMMDDTHHmmss");
                    approvalObj.body = comment[6];
                } else {
                    approvalObj.created = "";
                    approvalObj.body = "";
                }

                for (var sCurFullListArrIdx = 0; sCurFullListArrIdx < sCurFullListArr.length; sCurFullListArrIdx++) {
                    var sCurFullList = sCurFullListArr[sCurFullListArrIdx]; //현 결재자 ""
                    if (appList[1] == sCurFullList[1] && appList[5] == sCurFullList[5]) {
                        approvalObj.approval = true;
                        break;
                    } else {
                        approvalObj.approval = false;
                    }
                }
                //####################################################################################
                var approvalKind = appList[0]; //AP:결재,AG:협조
                approvalKind = approvalKind.replace(/ /g, "");
                if (approvalKind.indexOf('!@') > -1) {
                    approvalKind = util.strLeft(approvalKind, '!@'); //AG_P!@AG_A===>  AG_P
                }
                if (approvalKind == "AP" && appListArrIdx == 0) {
                    var firstdeptAP = qObj.langObj.type.firstdeptAP;
                    if (typeof (firstdeptAP) === undefined || typeof (firstdeptAP) === "undefined" || firstdeptAP === null || firstdeptAP === "") {

                    } else {
                        approvalKindlang = firstdeptAP;
                    }
                }

                // console.log("2222222222222222", approvalKind);
                var approvalKindlang = '';
                var arrApprovalkind = qObj.langObj.type.list;

                for (var kindIndex = 0; kindIndex < arrApprovalkind.length; kindIndex++) {
                    var objApprovalkind = arrApprovalkind[kindIndex];
                    var kindVal = objApprovalkind[approvalKind];
                    // console.log(kindVal, "lllllllllllllllllllllllllll");
                    if (typeof (kindVal) === undefined || typeof (kindVal) === "undefined" || kindVal === null || kindVal === "") {

                    } else {
                        approvalKindlang = kindVal;
                        break;
                    }
                }


                if (approvalKind == "AP" && appListArrIdx == 0) {
                    var firstAP = qObj.langObj.type.firstAP;
                    if (typeof (firstAP) === undefined || typeof (firstAP) === "undefined" || firstAP === null || firstAP === "") {

                    } else {
                        approvalKindlang = firstdeptAP;
                    }
                }
                approvalObj.approvalKind = approvalKindlang;
                //####################################################################################
                var photoUrl = config.photo;
                photoUrl = photoUrl.replace(/#sabun#/g, appList[4]);
                approvalObj.photo = photoUrl;
                approvalObj.author = common.languageConverter(appList[3], qObj.language, ",", ":");
                approvalObj.authorposition = common.languageConverter(appList[8], qObj.language, ",", ":");
                approvalObj.authordept = common.languageConverter(appList[13], qObj.language, ",", ":");

                approvalInfoArr[count] = approvalObj;
                count++;
            }
        }

        //////////////////////////////////////////////////////////////////////////////

        retObj.subject = row["_subject"];
        retObj.openurl = row["_openurl"];
        retObj.photo = row["_authorempno"];
        retObj.created = moment(row["_startdate"]).utc().format("YYYYMMDDTHHmmss");
        retObj.approvalinfo = approvalInfoArr;
        ret.push(retObj);
    }
    var result = {};
    result.data = ret;
    result.cnt = rows[0]['@siblings'];
    // console.log(result);
    util.writeSuccess(result, res);
}
//결재 할 문서 매인쪽
function approve(config, qObj, res, req) {
    //결재 할 문서        
    var url = config.host + config.approval.approve;
    var sabun = qObj.sabun;
    var language = qObj.language;
    url = url.replace(/#size#/, qObj.size);
    url = url.replace(/#page#/, qObj.page);
    url = url.replace(/#sabun#/, sabun);

    if (qObj.filter == "all") {
        url += `&sortcolumn=_startdate&sortorder=descending&search=(([sCurAppIDList] contains "${qObj.sabun}" OR [sCurAgIDList] contains "${qObj.sabun}" OR [sReceiveID] contains "${qObj.sabun}" OR [sAuditIDs] contains "${qObj.sabun}")) and (${qObj.keyword})`;
    } else if (qObj.filter == "subject") {
        url += `&sortcolumn=_startdate&sortorder=descending&search=(([sCurAppIDList] contains "${qObj.sabun}" OR [sCurAgIDList] contains "${qObj.sabun}" OR [sReceiveID] contains "${qObj.sabun}" OR [sAuditIDs] contains "${qObj.sabun}")) and ([Subject] contains ${qObj.keyword})`;
    } else if (qObj.filter == "formTitle") {
        url += `&sortcolumn=_startdate&sortorder=descending&search=(([sCurAppIDList] contains "${qObj.sabun}" OR [sCurAgIDList] contains "${qObj.sabun}" OR [sReceiveID] contains "${qObj.sabun}" OR [sAuditIDs] contains "${qObj.sabun}")) and ([sFormTitle] contains ${qObj.keyword})`;
    } else if (qObj.filter == "authorName") {
        url += `&sortcolumn=_startdate&sortorder=descending&search=(([sCurAppIDList] contains "${qObj.sabun}" OR [sCurAgIDList] contains "${qObj.sabun}" OR [sReceiveID] contains "${qObj.sabun}" OR [sAuditIDs] contains "${qObj.sabun}")) and ([AuthorName] contains ${qObj.keyword})`;
    } else if (qObj.filter == "authorOrgName") {
        url += `&sortcolumn=_startdate&sortorder=descending&search=(([sCurAppIDList] contains "${qObj.sabun}" OR [sCurAgIDList] contains "${qObj.sabun}" OR [sReceiveID] contains "${qObj.sabun}" OR [sAuditIDs] contains "${qObj.sabun}")) and ([AuthorOrgName] contains ${qObj.keyword})`;
    } else if (qObj.filter == "date") {
        url += `&sortcolumn=_startdate&sortorder=descending&search=(([sCurAppIDList] contains "${qObj.sabun}" OR [sCurAgIDList] contains "${qObj.sabun}" OR [sReceiveID] contains "${qObj.sabun}" OR [sAuditIDs] contains "${qObj.sabun}")) and (([sStartDate] >= ${qObj.startDate} and [sStartDate] <= ${qObj.endDate}))`;
    }
    url = encodeURI(url);
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
            console.log("****************approve*******************");
            // console.log(response.data, "????????????");
            if (response.data == null | response.data == "" | response.data == undefined | response.data == [] | response.data == "undefined") {
                response.data = [];
                util.writeSuccess(response.data, res);
                return;
            }
            var ret = [];
            var rows = response.data;
            // console.log(rows);
            for (var i = 0; i < rows.length; i++) {
                var retObj = {};
                var row = rows[i];
                // console.log(row);
                retObj.author = common.languageConverter(row._author, qObj.language, ",", ":");
                retObj.authordept = common.languageConverter(row._authordept, qObj.language, ",", ":");
                // var commentArr = row._comment.split("†¶");
                var commentArr = row._comment.split("!@#$");
                // var commentArr2 = commentArr[0].split("†");
                var commentArr2 = commentArr[0].split("!@");
                var isCommentArr = common.strToArr(row._comment, "!@#$", "!@");
                // var isCommentArr = common.strToArr(row._comment, "†¶", "†");
                var commentCount = 0;
                for (var isCommentArrIdx = 0; isCommentArrIdx < isCommentArr.length; isCommentArrIdx++) {
                    if (isCommentArr[isCommentArrIdx][6] !== "") {
                        commentCount++;
                    }
                }
                if (commentCount == 0) {
                    retObj.isComment = false;
                } else {
                    retObj.isComment = true;
                }
                retObj.authorposition = common.languageConverter(commentArr2[3], qObj.language, ",", ":");
                retObj.category = common.languageConverter(row._formtitle, qObj.language, ",", ":");
                retObj.openurl = row._openurl;
                if (response.data[i]['_attach'] == "true") {
                    retObj.attach = true;
                } else if (response.data[i]['_attach'] == "false") {
                    retObj.attach = false;
                } else {
                    retObj.attach = false;
                }
                var unid = util.strLeft(response.data[i]['_openurl'], "?");
                var unidArr = unid.split('/');
                retObj.unid = unidArr[7].substring(14);
                retObj.subject = response.data[i]._subject;
                retObj.photo = row["_authorempno"];
                retObj.created = moment(response.data[i]._startdate).utc().format("YYYYMMDDTHHmmss");
                retObj.status = response.data[i]._appinginfo;
                if (response.data[i]._sstatus === 'ing') {
                    retObj.statusinfo = '진행'
                } else if (response.data[i]._sstatus === 'receivewait') {
                    retObj.statusinfo = '접수대기'
                } else if (response.data[i]._sstatus === 'mutualing') {
                    retObj.statusinfo = '협조 진행중'
                } else if (response.data[i]._sstatus === 'mutualwait') {
                    retObj.statusinfo = '협조요청대기'
                } else if (response.data[i]._sstatus === 'received') {
                    retObj.statusinfo = '접수'
                } else if (response.data[i]._sstatus === 'reject') {
                    retObj.statusinfo = '반려'
                } else if (response.data[i]._sstatus === 'complete') {
                    retObj.statusinfo = '완료'
                } else if (response.data[i]._sstatus === 'draft') {
                    retObj.statusinfo = '임시저장'
                }
                ret.push(retObj);
            }
            var result = {};
            result.data = ret;
            result.cnt = rows[0]['@siblings'];
            util.writeSuccess(result, res);

            return;

        })
        .catch((error) => {

        });
}

function getApprovalLanguages(qObj, url, das) {
    var ret = {};
    for (var index = 0; index < das.length; index++) {
        var lanObj = das[index];
        var docProtocol = util.strLeft(url, "://"); //http OR https
        var docHost = util.strRight(url, "://"); //swg60.saerom.co.kr/dwp/com/abc.nsf/~ OR swg60.saerom.co.kr:8088/dwp/com/abc.nsf/~
        docHost = util.strLeft(docHost, "/"); //swg60.saerom.co.kr OR swg60.saerom.co.kr:8088
        var docUrl =
            docProtocol + "://" + docHost + lanObj["@link"]["href"];
        var docObj = getLanguage(docUrl, qObj.cookie);
        var fieldObj = JSON.parse(docObj.getBody("utf-8"));
        //nm_attr VS lang_word:
        var names = fieldObj.nm_attr;
        //console.log(names,"names");
        var values = fieldObj.lang_word;
        if (typeof (names) == "string") {
            names = names.split('\n');
            // console.log(names);
            values = values.split('\n');
        }
        for (
            var attrIndex = 0;
            attrIndex < names.length;
            attrIndex++
        ) {
            //.console.log(names[attrIndex], response.config.key);
            var origKey = "mobile.approval";
            if (names[attrIndex].indexOf(origKey) == 0) {
                //mobie.config.login.setlogin, ....
                var key = util.strRight(
                    names[attrIndex],
                    origKey + "."
                ); //config.login.setlogin, .... OR login.setlogin, ....
                var arrNameSpace = key.split(".");
                //console.log(arrNameSpace);
                var pObj = ret;
                for (var nsIndex = 0; nsIndex < arrNameSpace.length - 1; nsIndex++) {
                    var ns = arrNameSpace[nsIndex];
                    if (!pObj.hasOwnProperty(ns)) {
                        pObj[ns] = {};
                    }
                    pObj = pObj[ns];
                    //1'st : ret["login"] = {}
                    //2'nd: ret["login"]
                }
                var ns = arrNameSpace[arrNameSpace.length - 1];

                // console.log(ns,ns.indexOf('['));
                if (ns.indexOf('[') != -1 && ns.indexOf(']') != -1) {
                    //다국어 설정 맨뒤 namespace
                    //예를 들어 'mobile.config.display.list["10","15","30"]'
                    //values[attrIndex] <= '["10개","15개","30개"]'
                    var valArr = eval(values[attrIndex]); // ["10개","15개","30개"]
                    //key만 추출
                    var arrKey = util.strLeft(ns, "["); //list of list["10","15","30"]
                    var values2 = util.strRight(ns, "[", true); //["10","15","30"] of list["10","15","30"]
                    //config.display.list[{"10":"10개"},{"15":"15개"},{"30":"30개"}]
                    pObj[arrKey] = []; // config.display.list = []
                    var arrValue = eval(values2); //["10","15","30"]
                    for (var valIndex = 0; valIndex < arrValue.length; valIndex++) {
                        var obj = {};
                        var objKey = arrValue[valIndex];
                        obj[objKey] = valArr[valIndex];  // {"10":"10개"}
                        pObj[arrKey].push(obj);
                    }
                } else {
                    //예를 들어 'mobile.config.login.setlogin'
                    //console.log("*********attrIndex*********",attrIndex);

                    pObj[ns] = values[attrIndex];
                }
            }
        }
    }

    return ret;
}
//다국어 추출하여 반환하는 함수
function getLanguage(documentUrl, cookie) {
    var ret = {};
    ret = syncRequest("GET", documentUrl, {
        headers: {
            encoding: "utf-8",
            Cookie: cookie,
            "Accept-Language":
                "en-US,en;q=0.9,fr;q=0.8,ro;q=0.7,ru;q=0.6,la;q=0.5,pt;q=0.4,de;q=0.3",
            "Cache-Control": "max-age=0",
            Connection: "keep-alive",
            "Upgrade-Insecure-Requests": "1",
            "User-Agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.106 Safari/537.36",
            "Content-Type": "application/json",
        },
    });
    return ret;
};
//회사 코드 구하기
async function getCompanyCode(qObj, req) {
    url = config.host_webserver + config.getCompanyCode;
    console.log(url);
    var companyCode = await axios({
        method: "get",
        url: url,
        httpsAgent: agent,
        headers: {
            "Content-Type": "application/json",
            "Cookie": qObj.cookie
        },
    })
        .then((response) => {
            console.log("****************회사 코드*******************");
            //console.log(response.data, "xxxxxxxxxxxxxxxxxxxxxxxx");
            var companyCode = response.data.companyCode.split(", ");

            return companyCode[0];
        })
        .catch((error) => {
            throw new Error(error);
        });
    return companyCode;
}
//작성 중,반려 문서 리스트
async function getItemList(config, qObj, res, req, url) {
    // var url = config.host + config.approval.draft
    // url = url.replace("#size#", qObj.size);
    // url = url.replace("#page#", qObj.page);
    // url = url.replace("#sabun#", qObj.sabun);
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
            console.log("**************** 작성 중 문서*******************");

            return response.data;
        })
        .catch((error) => {
            return [];
        });
    if (result == [] || result == "[]" || result == undefined || result == "" || result == null || result == "undefined") {
        result == [];
        var resultObj = {};
        resultObj.data = [];
        resultObj.cnt = 0;
        util.writeSuccess(resultObj, res);
        return;
    }
    // console.log(result);
    var resultArr = [];
    for (var resultIdx = 0; resultIdx < result.length; resultIdx++) {
        var resultObj = {};

        resultObj.unid = result[resultIdx]["@unid"];
        // if (qObj.type == "draft") {
        //     var openurl = util.strLeft(result[resultIdx]["@href"], ".nsf");
        //     openurl = openurl.replace("#unid#", result[resultIdx]["_unid"]);
        //     resultObj.openurl = openurl;
        // } else {
        resultObj.openurl = result[resultIdx]["_openurl"];
        // }
        resultObj.subject = result[resultIdx]["_subject"];
        resultObj.created = moment(result[resultIdx]["_created"]).utc().format("YYYYMMDDTHHmmss");
        if (result[resultIdx]["_attach"] === "true") {
            resultObj.attach = true;
        } else if (result[resultIdx]["_attach"] === "false") {
            resultObj.attach = false;
        }

        var formTitleArr = result[resultIdx]["_formtitle"].split(",");  //["ko:품의서","en:Consultation","zh:禀议书","hu:Consultation","in:Consultation"]
        for (var formTitleIdx = 0; formTitleIdx < formTitleArr.length; formTitleIdx++) {
            if (qObj.language == "ko") {
                if (formTitleArr[formTitleIdx].indexOf("ko") > -1) {
                    resultObj.category = util.strRight(formTitleArr[formTitleIdx], "ko:");
                }
            } else if (qObj.language == "en") {
                if (formTitleArr[formTitleIdx].indexOf("en") > -1) {
                    resultObj.category = util.strRight(formTitleArr[formTitleIdx], "en:");
                }
            } else if (qObj.language == "zn") {
                if (formTitleArr[formTitleIdx].indexOf("zn") > -1) {
                    resultObj.category = util.strRight(formTitleArr[formTitleIdx], "zn:");
                }
            } else if (qObj.language == "hu") {
                if (formTitleArr[formTitleIdx].indexOf("hu") > -1) {
                    resultObj.category = util.strRight(formTitleArr[formTitleIdx], "hu:");
                }
            } else if (qObj.language == "in") {
                if (formTitleArr[formTitleIdx].indexOf("in") > -1) {
                    resultObj.category = util.strRight(formTitleArr[formTitleIdx], "in:");
                }
            }
        }

        resultArr[resultIdx] = resultObj;
    }
    var dataObj = {};
    dataObj.data = resultArr;
    dataObj.cnt = result[0]["@siblings"];
    util.writeSuccess(dataObj, res);
}
//결재 완료함(개인,부서,일자별) 리스트
async function getSuccessList(config, qObj, res, req, url) {
    if (qObj.filter == "all") {
        url += `&sortcolumn=_startdate&sortorder=descending&query=(${qObj.keyword})`;
    } else if (qObj.filter == "authorName") {
        url += `&sortcolumn=_startdate&sortorder=descending&query=([AuthorName] contains ${qObj.keyword})`;
    } else if (qObj.filter == "subject") {
        url += `&sortcolumn=_startdate&sortorder=descending&query=([Subject] contains ${qObj.keyword})`;
    } else if (qObj.filter == "body") {
        url += `&sortcolumn=_startdate&sortorder=descending&query=([Body] contains ${qObj.keyword})`;
    } else if (qObj.filter == "attach") {
        url += `&sortcolumn=_startdate&sortorder=descending&query=([@attachments] contains ${qObj.keyword})`;
    }
    url = encodeURI(url);
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
            console.log("**************** 완료함 문서*******************");

            return response.data;
        })
        .catch((error) => {
            // throw new Error(error);
            return [];
        });
    try {
        if (result == [] || result == "[]" || result == undefined || result == "" || result == null || result == "undefined") {
            result = [];
            util.writeSuccess(result, res);
            return;
        }

        var resultSet = result["hits"]["hits"];
        var dataObj = {};
        var resultArr = [];
        for (var resultSetIdx = 0; resultSetIdx < resultSet.length; resultSetIdx++) {
            var resultObj = {};
            var unid = util.strLeft(resultSet[resultSetIdx]["_source"]["_vc_wviwlist30__openurl"], "?");
            unid = util.strRight(unid, "/vdockey/");
            resultObj.unid = unid.substring(14);
            resultObj.openurl = resultSet[resultSetIdx]["_source"]["_vc_wviwlist30__openurl"];
            resultObj.subject = resultSet[resultSetIdx]["_source"]["subject"];
            resultObj.created = moment(resultSet[resultSetIdx]["_source"]["sstartdate"]).utc().format("YYYYMMDDTHHmmss");
            resultObj.completedate = moment(resultSet[resultSetIdx]["_source"]["scompletedate"]).utc().format("YYYYMMDDTHHmmss");

            var authorname = common.languageConverter(resultSet[resultSetIdx]["_source"]["authorname"], qObj.language, ",", ":");
            resultObj.authorname = authorname
            if (resultSet[resultSetIdx]["_source"]["_vc_wviwlist30__authororgname"] == undefined) {
                var authororgname = common.languageConverter(resultSet[resultSetIdx]["_source"]["authororgname"], qObj.language, ",", ":");
                resultObj.authororgname = authororgname
            } else {
                var authororgname = common.languageConverter(resultSet[resultSetIdx]["_source"]["_vc_wviwlist30__authororgname"], qObj.language, ",", ":");
                resultObj.authororgname = authororgname
            }

            var category = common.languageConverter(resultSet[resultSetIdx]["_source"]["_vc_wviwlist30__sformtitle"], qObj.language, ",", ":");
            resultObj.category = category

            resultArr[resultSetIdx] = resultObj;
        }
        dataObj.data = resultArr;
        dataObj.cnt = result["hits"]["total"]["value"];

        util.writeSuccess(dataObj, res);

    } catch (e) {
        console.log(e);
        var resultArr = [];
        var dataObj = {};
        for (var i = 0; i < result.length; i++) {
            var resultObj = {};
            var item = result[i];
            var unid = util.strLeft(item["_openurl"], "?");
            unid = util.strRight(unid, "/vdockey/");
            resultObj.unid = unid.substring(14);
            resultObj.openurl = item["_openurl"];
            resultObj.subject = item["_subject"];
            resultObj.created = moment(item["_startdate"]).utc().format("YYYYMMDDTHHmmss");
            resultObj.completedate = moment(item["_scompletedate"]).utc().format("YYYYMMDDTHHmmss");
            resultObj.authorname = common.languageConverter(item["_author"], qObj.language, ",", ":");
            resultObj.authororgname = common.languageConverter(item["_authordept"], qObj.language, ",", ":");
            resultObj.category = common.languageConverter(item["_sformtitle"], qObj.language, ",", ":");

            resultArr[i] = resultObj;
        }
        dataObj.data = resultArr;
        dataObj.cnt = result[0]["@siblings"];
        util.writeSuccess(dataObj, res);
        return;
    }
    // console.log(resultSet);

}
//결재 양식 전체 리스트
async function getFormListAll(config, qObj, res, req, url) {
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
            console.log("**************** 결재 양식 전체 리스트*******************");

            return response.data;
        })
        .catch((error) => {
            throw new Error(error);
        });
    // console.log(result);
    var resultArr = [];
    var count = 0;
    for (var formListIdx = 0; formListIdx < result.length; formListIdx++) {
        if (result[formListIdx]["_formtitle"] != undefined) {
            var resultObj = {};
            resultObj.unid = result[formListIdx]["@unid"];
            resultObj.category = common.languageConverter(result[formListIdx]["_formtitle"], qObj.language, ",", ":");
            resultObj.formcode = result[formListIdx]["_formalias"];
            resultArr[count] = resultObj;
            count++;
        }
    }



    util.writeSuccess(resultArr, res);
}
//최근 사용한 결재서식 리스트
async function getFormListRecent(config, qObj, res, req, url) {
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
            console.log("**************** 최근 사용한 결재서식 리스트 *******************");

            return response.data;
        })
        .catch((error) => {
            throw new Error(error);
        });
    // console.log(result);
    // var resultArr = [];
    // for (var formListIdx = 0; formListIdx < result.length; formListIdx++) {
    //     var resultObj = {};
    //     var formTitleArr = result[formListIdx]["_sformtitle"].split(",");
    //     if (qObj.language == "ko") {
    //         for (var formTitleArrIdx = 0; formTitleArrIdx < formTitleArr.length; formTitleArrIdx++) {
    //             if (formTitleArr[formTitleArrIdx].indexOf("ko:") > -1) {
    //                 resultObj.category = util.strRight(formTitleArr[formTitleArrIdx], "ko:");
    //             }
    //         }
    //     } else if (qObj.language == "en") {
    //         for (var formTitleArrIdx = 0; formTitleArrIdx < formTitleArr.length; formTitleArrIdx++) {
    //             if (formTitleArr[formTitleArrIdx].indexOf("en:") > -1) {
    //                 resultObj.category = util.strRight(formTitleArr[formTitleArrIdx], "en:");
    //             }
    //         }
    //     } else if (qObj.language == "zh") {
    //         for (var formTitleArrIdx = 0; formTitleArrIdx < formTitleArr.length; formTitleArrIdx++) {
    //             if (formTitleArr[formTitleArrIdx].indexOf("zh:") > -1) {
    //                 resultObj.category = util.strRight(formTitleArr[formTitleArrIdx], "zh:");
    //             }
    //         }
    //     } else if (qObj.language == "hu") {
    //         for (var formTitleArrIdx = 0; formTitleArrIdx < formTitleArr.length; formTitleArrIdx++) {
    //             if (formTitleArr[formTitleArrIdx].indexOf("hu:") > -1) {
    //                 resultObj.category = util.strRight(formTitleArr[formTitleArrIdx], "hu:");
    //             }
    //         }
    //     } else if (qObj.language == "in") {
    //         for (var formTitleArrIdx = 0; formTitleArrIdx < formTitleArr.length; formTitleArrIdx++) {
    //             if (formTitleArr[formTitleArrIdx].indexOf("in:") > -1) {
    //                 resultObj.category = util.strRight(formTitleArr[formTitleArrIdx], "in:");
    //             }
    //         }
    //     }
    //     resultObj.formcode = result[formListIdx]["_formcode"];
    //     resultObj.unid = result[formListIdx]["@unid"];
    //     resultArr[formListIdx] = resultObj;
    // }

    util.writeSuccess(resultArr, res);
}
//자주 사용하는 결재서식
async function getFormListFavorite(config, qObj, res, req, url) {
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
            console.log("**************** 자주 사용하는 결재서식*******************");

            return response.data[0]["_formList"];
        })
        .catch((error) => {
            throw new Error(error);
        });
    var formListArr = result.split(";");
    var resultArr = [];
    for (var formListArrIdx = 0; formListArrIdx < formListArr.length; formListArrIdx++) {
        var resultObj = {};
        var formTitle = util.strRight(formListArr[formListArrIdx], "^");
        var formTitleArr = formTitle.split(",");
        if (qObj.language == "ko") {
            for (var formTitleArrIdx = 0; formTitleArrIdx < formTitleArr.length; formTitleArrIdx++) {
                if (formTitleArr[formTitleArrIdx].indexOf("ko:") > -1) {
                    resultObj.category = util.strRight(formTitleArr[formTitleArrIdx], "ko:");
                }
            }
        } else if (qObj.language == "en") {
            for (var formTitleArrIdx = 0; formTitleArrIdx < formTitleArr.length; formTitleArrIdx++) {
                if (formTitleArr[formTitleArrIdx].indexOf("en:") > -1) {
                    resultObj.category = util.strRight(formTitleArr[formTitleArrIdx], "en:");
                }
            }
        } else if (qObj.language == "zh") {
            for (var formTitleArrIdx = 0; formTitleArrIdx < formTitleArr.length; formTitleArrIdx++) {
                if (formTitleArr[formTitleArrIdx].indexOf("zh:") > -1) {
                    resultObj.category = util.strRight(formTitleArr[formTitleArrIdx], "zh:");
                }
            }
        } else if (qObj.language == "hu") {
            for (var formTitleArrIdx = 0; formTitleArrIdx < formTitleArr.length; formTitleArrIdx++) {
                if (formTitleArr[formTitleArrIdx].indexOf("hu:") > -1) {
                    resultObj.category = util.strRight(formTitleArr[formTitleArrIdx], "hu:");
                }
            }
        } else if (qObj.language == "in") {
            for (var formTitleArrIdx = 0; formTitleArrIdx < formTitleArr.length; formTitleArrIdx++) {
                if (formTitleArr[formTitleArrIdx].indexOf("in:") > -1) {
                    resultObj.category = util.strRight(formTitleArr[formTitleArrIdx], "in:");
                }
            }
        }
        resultObj.formcode = util.strLeft(formListArr[formListArrIdx], "^");
        resultArr[formListArrIdx] = resultObj;
    }

    util.writeSuccess(resultArr, res);
}
//결재문서 상세보기
async function getDetailItem(ret, qObj) {
    let config = qObj.config;
    let res = qObj.res;
    let req = qObj.req;
    qObj.ret = ret;
    // console.log(qObj.langObj.type.list);
    var url = config.host + qObj.openurl
    var unid = util.strLeft(qObj.openurl, "?");
    qObj.unid = unid.slice(-32);
    console.log(qObj.unid, "ssssssssssssssssssssssss");
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
            console.log("**************** detail *******************");

            return response.data;
        })
        .catch((error) => {
            throw new Error(error);
        });
    console.log(data);
    const $ = cheerio.load(data);
    var resultObj = {};
    var displayDataObj = {};
    var formDataObj = {};
    //displayData********************************************************
    displayDataObj.openurl = qObj.openurl;
    //제목
    var subject = "";
    $("div.dwp-title[data-xlang-code='comm.title.subject']").each(function (index) {
        if ($(this).parent().find("div.dwp-input").length > 0) {
            subject = $(this).parent().find("div.dwp-input").text();
        }
    });
    displayDataObj.subject = subject;

    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // 에이스테크 - 근태승인신청서
    // 회사 선택
    var selCompany = "";
    selCompany = $("body > form > div.dwp-page-body > div > div > div.dwp-contents-article > div.dwp-section.head-area > div > div:nth-child(2) > div.dwp-value > div > div").attr("data-xlang-value");
    displayDataObj.selCompany = selCompany;
    displayDataObj.selCompany_Nm = qObj.ret.selCompany[selCompany];
    // 년차
    var division = "";
    division = $("body > form > div.dwp-page-body > div > div > div.dwp-contents-article > div.dwp-section.head-area > div > div:nth-child(2) > div:nth-child(8) > table > tbody > tr:nth-child(1) > td:nth-child(2) > div > div > div").attr("data-xlang-value");
    displayDataObj.division = division;
    displayDataObj.division_Nm = qObj.ret.division[division];
    // 수신
    var joint_owner = "";
    joint_owner = $(`input[name="joint_owner"]`).val();
    displayDataObj.joint_owner = joint_owner;
    // 수신2
    var joint_ownerFull = "";
    joint_ownerFull = $(`input[name="joint_ownerFull"]`).val();
    displayDataObj.joint_ownerFull = joint_ownerFull;
    
    // 주관부서 - 담당
    var sReceiveOrgName = "";
    sReceiveOrgName = data.match(/"Duty":"(.*)"/);
    displayDataObj.sReceiveOrgName = sReceiveOrgName[1];
    // 주관부서 - 담당 조직도 정보
    displayDataObj.Org_id = qObj.ret["Org_id"];
    // 현지퇴근
    var cause = "";
    cause = $("body > form > div.dwp-page-body > div > div > div.dwp-contents-article > div.dwp-section.head-area > div > div:nth-child(2) > div:nth-child(8) > table > tbody > tr:nth-child(5) > td > div").text();
    displayDataObj.cause = cause;
    // 야근특시
    var plan = "";
    plan = $("body > form > div.dwp-page-body > div > div > div.dwp-contents-article > div.dwp-section.head-area > div > div:nth-child(2) > div:nth-child(8) > table > tbody > tr:nth-child(4) > td > div.dwp-textarea.mg").text();
    displayDataObj.plan = plan;
    // 사유
    var reason = "";
    reason = $("body > form > div.dwp-page-body > div > div > div.dwp-contents-article > div.dwp-section.head-area > div > div:nth-child(2) > div:nth-child(8) > table > tbody > tr:nth-child(1) > td:nth-child(4) > div").text();
    displayDataObj.reason = reason;
    // 추가의견
    var AddOpinion = "";
    AddOpinion = $("body > form > div.dwp-page-body > div > div > div.dwp-contents-article > div.dwp-section.head-area > div > div:nth-child(2) > div:nth-child(4) > div.dwp-value > div:nth-child(2) > div.dwp-value > div").text();
    displayDataObj.AddOpinion = AddOpinion;
    // 시작날짜
    var ReqFrom = "";
    ReqFrom = $("body > form > div.dwp-page-body > div > div > div.dwp-contents-article > div.dwp-section.head-area > div > div:nth-child(2) > div:nth-child(8) > table > tbody > tr:nth-child(2) > td > div > span:nth-child(1)").attr("data-xlang-code");
    try {
        ReqFrom = ReqFrom.split("T");
        displayDataObj.ReqFrom = ReqFrom[0];
    } catch (err) {
        displayDataObj.ReqFrom = ReqFrom;
    }
    // 시작시
    var StartTime = "";
    StartTime = $("body > form > div.dwp-page-body > div > div > div.dwp-contents-article > div.dwp-section.head-area > div > div:nth-child(2) > div:nth-child(8) > table > tbody > tr:nth-child(2) > td > div > span:nth-child(2)").text();
    displayDataObj.StartTime = StartTime;
    // 시작분
    var EndTime = "";
    EndTime = $("body > form > div.dwp-page-body > div > div > div.dwp-contents-article > div.dwp-section.head-area > div > div:nth-child(2) > div:nth-child(8) > table > tbody > tr:nth-child(2) > td > div > span:nth-child(4)").text();
    displayDataObj.EndTime = EndTime;
    // 종료날짜
    var to = "";
    to = $("body > form > div.dwp-page-body > div > div > div.dwp-contents-article > div.dwp-section.head-area > div > div:nth-child(2) > div:nth-child(8) > table > tbody > tr:nth-child(2) > td > div > span:nth-child(7)").attr("data-xlang-code");
    try {
        to = to.split("T");
        displayDataObj.to = to[0];
    } catch (err) {
        displayDataObj.to = to;
    }
    // 종료시
    var StartTime_1 = "";
    StartTime_1 = $("body > form > div.dwp-page-body > div > div > div.dwp-contents-article > div.dwp-section.head-area > div > div:nth-child(2) > div:nth-child(8) > table > tbody > tr:nth-child(2) > td > div > span:nth-child(8)").text();
    displayDataObj.StartTime_1 = StartTime_1;
    // 종료분
    var EndTime_1 = "";
    EndTime_1 = $("body > form > div.dwp-page-body > div > div > div.dwp-contents-article > div.dwp-section.head-area > div > div:nth-child(2) > div:nth-child(8) > table > tbody > tr:nth-child(2) > td > div > span:nth-child(10)").text();
    displayDataObj.EndTime_1 = EndTime_1;
    // 권한
    var DocPermission = "";
    DocPermission = $("body > form > div.dwp-page-body > div > div > div.dwp-contents-article > div.dwp-section.head-area > div > div:nth-child(2) > div:nth-child(4) > div.dwp-value > div.dwp-grouping > div.dwp-selection-group").attr("data-xlang-value");
    displayDataObj.DocPermission = DocPermission;
    // 권한기간
    var DocPeriod = "";
    DocPeriod = $("body > form > div.dwp-page-body > div > div > div.dwp-contents-article > div.dwp-section.head-area > div > div:nth-child(2) > div:nth-child(4) > div.dwp-value > div.dwp-grouping > div.dwp-selection-group > div.dwp-selectbox > div").attr("data-xlang-value");
    displayDataObj.DocPeriod = DocPeriod;
    // 결재자 총 카운트 1단계
    var AprTcount1 = "";
    AprTcount1 = $(`input[name="AprTcount1"]`).val();
    displayDataObj.AprTcount1 = AprTcount1;
    // 결재자 총 카운트 2단계
    var AprTcount2 = "";
    AprTcount2 = $(`input[name="AprTcount2"]`).val();
    displayDataObj.AprTcount2 = AprTcount2;
    // 근태대상자
    var person = "";
    person = $("body > form > div.dwp-page-body > div > div > div.dwp-contents-article > div.dwp-section.head-area > div > div:nth-child(2) > div:nth-child(8) > table > tbody > tr:nth-child(3) > td > div").text();
    displayDataObj.person = person;
    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    //양식
    var category = "";
    category = $("div.dwp-page-title").attr("data-xlang-txt");
    category = common.languageConverter(category, qObj.language, ",", ":");
    displayDataObj.status = $("input[name='sStatus']").val();
    displayDataObj.unid = qObj.unid;
    ///////////////////////////////////////////////////////
    var formCode = util.strRight(data, '"FormAlias":"');
    formCode = util.strLeft(formCode, '",');
    displayDataObj.formCode = formCode;
    qObj.formCode = formCode;
    displayDataObj.category = category;
    //기안자 정보
    var authorinfo = $("input[name='myinfo']").val();
    var authorinfoArr = authorinfo.split("^");
    displayDataObj.authorName = common.languageConverter(authorinfoArr[3], qObj.language, ",", ":");
    displayDataObj.authorGradeName = common.languageConverter(authorinfoArr[8], qObj.language, ",", ":");
    displayDataObj.authorOrgName = common.languageConverter(authorinfoArr[13], qObj.language, ",", ":");

    var agreeBtn = $("div.dwp-btn-group").attr("data-btn-list");
    if (agreeBtn.indexOf("act_reject") > -1) {
        displayDataObj.agreeBtn = true;
    } else {
        displayDataObj.agreeBtn = false;
    }
    var commentArr = common.strToArr($("input[name='sComment1']").val(), "¶", "†"); //기안부서 코멘트
    // console.log($("input[name='sComment1']").val(), "기안부서 코멘트기안부서 코멘트");
    // console.log(commentArr);
    for (commentArrIdx = 0; commentArrIdx < commentArr.length; commentArrIdx++) {
        item = commentArr[commentArrIdx]
        if (item[0] == "raise") {
            displayDataObj.created = moment(item[5]).utc().format("YYYYMMDDTHHmmss");
        }
    }

    try {
        var attachInfo = JSON.parse($('#Already_Attach').val());
        for (var attachInfoIdx = 0; attachInfoIdx < attachInfo.length; attachInfoIdx++) {
            attachInfo[attachInfoIdx]["size"] = common.formatBytes(attachInfo[attachInfoIdx]["size"], 2);
        }
        displayDataObj.attachInfo = attachInfo;
    } catch (error) {
        displayDataObj.attachInfo = [];
    }
    try {


        //결재정보 구하기
        var appListArr = common.strToArr($("input[name='sAppList1']").val(), ";", "^"); // 결재선 정보
        var sCurFullListArr = common.strToArr($("input[name='sCurFullList']").val(), ";", "^"); //현결재자
        var approvalInfoArr = [];
        var count = 0;
        for (var appListArrIdx = 0; appListArrIdx < appListArr.length; appListArrIdx++) {
            var approvalObj = {};
            var appList = appListArr[appListArrIdx];

            // for (var commentArrIdx = 0; commentArrIdx < commentArr.length; commentArrIdx++) {
            //     var comment = commentArr[commentArrIdx];
            //     console.log(appListArr[appListArrIdx]);
            //     if (appList[4] == comment[1]) {
            //         approvalObj.created = moment(comment[5]).utc().format("YYYYMMDDTHHmmss");
            //         approvalObj.body = comment[6];
            //         break;
            //     } else {
            //         approvalObj.created = "";
            //         approvalObj.body = "";
            //     }
            // }

            try {
                approvalObj.created = moment(commentArr[appListArrIdx][5]).utc().format("YYYYMMDDTHHmmss");
                approvalObj.body = commentArr[appListArrIdx][6];
            } catch (e) {
                approvalObj.created = "";
                approvalObj.body = "";
            }

            for (var sCurFullListArrIdx = 0; sCurFullListArrIdx < sCurFullListArr.length; sCurFullListArrIdx++) {
                var sCurFullList = sCurFullListArr[sCurFullListArrIdx]; //현 결재자 ""
                if (appList[1] == sCurFullList[1] && appList[5] == sCurFullList[5]) {
                    approvalObj.approval = true;
                    break;
                } else {
                    approvalObj.approval = false;
                }
            }
            //####################################################################################
            var approvalKind = appList[0]; //AP:결재,AG:협조
            approvalKind = approvalKind.replace(/ /g, "");
            if (approvalKind.indexOf('!@') > -1) {
                approvalKind = util.strLeft(approvalKind, '!@'); //AG_P!@AG_A===>  AG_P
            }

            var approvalKindlang = '';
            var arrApprovalkind = qObj.langObj.type.list;
            for (var kindIndex = 0; kindIndex < arrApprovalkind.length; kindIndex++) {
                var objApprovalkind = arrApprovalkind[kindIndex];
                var kindVal = objApprovalkind[approvalKind];
                if (typeof (kindVal) === undefined || typeof (kindVal) === "undefined" || kindVal === null || kindVal === "") {

                } else {
                    approvalKindlang = kindVal;
                    break;
                }
            }

            if (approvalKind == "AP" && appListArrIdx == 0) {
                var firstAP = qObj.langObj.type.firstAP;
                if (typeof (firstAP) === undefined || typeof (firstAP) === "undefined" || firstAP === null || firstAP === "") {

                } else {
                    approvalKindlang = firstAP;
                }
            }
            // console.log("$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$", commentArr);
            try {
                if (displayDataObj.status == "reject" && commentArr[appListArrIdx][0] == "reject") {
                    approvalObj.approvalKind = "반려";
                } else {
                    approvalObj.approvalKind = approvalKindlang;
                }
            } catch (e) {
                approvalObj.approvalKind = approvalKindlang;
            }

            //####################################################################################
            var photoUrl = config.photo;
            photoUrl = photoUrl.replace(/#sabun#/g, appList[4]);
            approvalObj.photo = photoUrl;
            approvalObj.author = common.languageConverter(appList[3], qObj.language, ",", ":");
            approvalObj.authorposition = common.languageConverter(appList[8], qObj.language, ",", ":");
            approvalObj.authordept = common.languageConverter(appList[13], qObj.language, ",", ":");

            approvalInfoArr[count] = approvalObj;
            count++;
        }

        var appListArr2 = common.strToArr($("input[name='sAppList2']").val(), ";", "^"); // 결재선 정보
        var commentArr2 = common.strToArr($("input[name='sComment2']").val(), "¶", "†"); //주관부서 코멘트
        if (appListArr2 != "") {
            for (var appListArrIdx = 0; appListArrIdx < appListArr2.length; appListArrIdx++) {
                var approvalObj = {};
                var appList = appListArr2[appListArrIdx];
                for (var commentArrIdx = 0; commentArrIdx < commentArr2.length; commentArrIdx++) {
                    var comment = commentArr2[commentArrIdx];
                    if (appList[4] == comment[1]) {
                        approvalObj.created = moment(comment[5]).utc().format("YYYYMMDDTHHmmss");
                        approvalObj.body = comment[6];
                        break;
                    } else {
                        approvalObj.created = "";
                        approvalObj.body = "";
                    }
                }

                for (var sCurFullListArrIdx = 0; sCurFullListArrIdx < sCurFullListArr.length; sCurFullListArrIdx++) {
                    var sCurFullList = sCurFullListArr[sCurFullListArrIdx]; //현 결재자 ""
                    if (appList[1] == sCurFullList[1] && appList[5] == sCurFullList[5]) {
                        approvalObj.approval = true;
                        break;
                    } else {
                        approvalObj.approval = false;
                    }
                }
                //####################################################################################
                var approvalKind = appList[0]; //AP:결재,AG:협조
                approvalKind = approvalKind.replace(/ /g, "");
                if (approvalKind.indexOf('!@') > -1) {
                    approvalKind = util.strLeft(approvalKind, '!@'); //AG_P!@AG_A===>  AG_P
                }
                if (approvalKind == "AP" && appListArrIdx == 0) {
                    var firstdeptAP = qObj.langObj.type.firstdeptAP;
                    if (typeof (firstdeptAP) === undefined || typeof (firstdeptAP) === "undefined" || firstdeptAP === null || firstdeptAP === "") {

                    } else {
                        approvalKindlang = firstdeptAP;
                    }
                }

                // console.log("2222222222222222", approvalKind);
                var approvalKindlang = '';
                var arrApprovalkind = qObj.langObj.type.list;

                for (var kindIndex = 0; kindIndex < arrApprovalkind.length; kindIndex++) {
                    var objApprovalkind = arrApprovalkind[kindIndex];
                    var kindVal = objApprovalkind[approvalKind];
                    // console.log(kindVal, "lllllllllllllllllllllllllll");
                    if (typeof (kindVal) === undefined || typeof (kindVal) === "undefined" || kindVal === null || kindVal === "") {

                    } else {
                        approvalKindlang = kindVal;
                        break;
                    }
                }


                if (approvalKind == "AP" && appListArrIdx == 0) {
                    var firstAP = qObj.langObj.type.firstAP;
                    if (typeof (firstAP) === undefined || typeof (firstAP) === "undefined" || firstAP === null || firstAP === "") {

                    } else {
                        approvalKindlang = firstdeptAP;
                    }
                }
                approvalObj.approvalKind = approvalKindlang;
                //####################################################################################
                var photoUrl = config.photo;
                photoUrl = photoUrl.replace(/#sabun#/g, appList[4]);
                approvalObj.photo = photoUrl;
                approvalObj.author = common.languageConverter(appList[3], qObj.language, ",", ":");
                approvalObj.authorposition = common.languageConverter(appList[8], qObj.language, ",", ":");
                approvalObj.authordept = common.languageConverter(appList[13], qObj.language, ",", ":");

                approvalInfoArr[count] = approvalObj;
                count++;
            }
        }

        if (qObj.type == "approving") {
            return approvalInfoArr;
        }
        displayDataObj.approvalInfo = approvalInfoArr;
    } catch (e) {
        console.log(e);
        displayDataObj.approvalInfo = [];
    }
    var bodyData = await getDetailBody(config, qObj, res, req)
    displayDataObj.body = bodyData.body;
    resultObj.displayData = displayDataObj;
    // formData********************************************************
    var formDataObj
    if (qObj.approvalType == "approve") {
        $("input").each(function () {
            formDataObj[$(this).attr("name")] = $(this).val();
        });
        resultObj.formData = formDataObj;
    }
    // 편집할때 필요한 정보
    var sAppList1Arr = $("input[name='sAppList1']").val().split(';');
    var appListArr = [];
    var count = 0;
    var sAppList1 = [];
    // console.log(sAppList1Arr);
    for (var i = 0; i < sAppList1Arr.length; i++) {
        var itemArr = sAppList1Arr[i].split("^");
        var url = `${config.elastic_address[config.version]}/${config.elasticPersonDB}/_search`;

        const id = config.elastic_id + ":" + config.elastic_pw;
        var authorization = Buffer.from(id, "utf8").toString("base64");

        // console.log(url);
        var query = `{
            "query": {
              "match": {
                "empno": "${itemArr[4]}"
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

                return data["hits"]["hits"];

            })
            .catch((error) => {
                throw new Error(error);
            });

        var orgArr = [];
        var appListObj = {};
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
        var photoUrl = config.photo;
        photoUrl = photoUrl.replace(/#sabun#/g, orgObj.mycode);
        orgObj.photo = photoUrl;
        orgObj.kinds = result[0]["_source"]["@form"];
        orgObj.approvalInfo = result[0]["_source"].approvalInfo;
        // orgArr[orgInx] = orgObj;
        appListObj.approvalInfo = orgObj;
        appListObj.appadd = itemArr[0].replace(/^\s+|\s+$/gm, '');
        appListObj.appDept = "sAppList1";
        appListArr[count] = appListObj;
        count++;

    }
    ///////////////////////////////
    var sAppList2Arr = $("input[name='sAppList2']").val().split(';');
    // console.log(sAppList2Arr);
    var sAppList2 = [];
    if (sAppList2Arr != "") {
        for (var x = 0; x < sAppList2Arr.length; x++) {
            var itemArr = sAppList2Arr[x].split("^");
            var url = `${config.elastic_address[config.version]}/${config.elasticPersonDB}/_search`;

            const id = config.elastic_id + ":" + config.elastic_pw;
            var authorization = Buffer.from(id, "utf8").toString("base64");

            // console.log(url);
            var query = `{
            "query": {
              "match": {
                "empno": "${itemArr[4]}"
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

                    return data["hits"]["hits"];

                })
                .catch((error) => {
                    throw new Error(error);
                });
            var orgArr = [];
            var appListObj = {};
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
            var photoUrl = config.photo;
            photoUrl = photoUrl.replace(/#sabun#/g, orgObj.mycode);
            orgObj.photo = photoUrl;
            orgObj.kinds = result[0]["_source"]["@form"];
            orgObj.approvalInfo = result[0]["_source"].approvalInfo;

            // orgArr[orgInx] = orgObj;
            appListObj.approvalInfo = orgObj;
            appListObj.appadd = itemArr[0].replace(/^\s+|\s+$/gm, '');
            appListObj.appDept = "sAppList2";

            appListArr[count] = appListObj;
            count++;
        }
    }
    displayDataObj.appList = appListArr;

    //사용안함 편집 기능 추가시 사용
    // var collect = await detailFormOption(config, qObj, res, req);
    //회수 가능여부
    // displayDataObj.isCollect = collect;
    //승인,반려인지 동의,반대인지
    if (sCurFullListArr[0][0].indexOf("AG") > -1) {
        displayDataObj.isAgree = true;
    } else {
        displayDataObj.isAgree = false;
    }
    // console.log(displayDataObj);
    if (qObj.approvalType === "draft") {
        displayDataObj.isEditBtn = true;
        // qObj.res = res;
        // qObj.config = config;
        // getOrgData(displayDataObj, qObj);
        // return;
    } else {
        displayDataObj.isEditBtn = false;
    }

    util.writeSuccess(displayDataObj, res);
}
//상세보기 body
async function getDetailBody(config, qObj, res, req) {

    // console.log(qObj.userInfo);
    var comalias = util.strRight(qObj.openurl, "/dwp/");
    comalias = util.strLeft(comalias, "/");
    if (qObj.approvalType == "complete") {
        var url = config.host + config.approval.detail_body_complete;
        url = url.replace("#unid#", qObj.unid);
        url = url.replace("#comalias#", comalias);
    } else {
        var url = config.host + config.approval.detail_body;
        url = url.replace("#unid#", qObj.unid);
        url = url.replace("#comalias#", comalias);
    }
    console.log(url);
    try {
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
                console.log("**************** detail body *******************");

                return response.data;
            })
            .catch((error) => {
                throw new Error(error);
            });
    } catch (e) {
        data = "";
    }

    // console.log(data);
    try {
        var resultObj = {};
        var dataArr = data.split('<p>\n<table border="1" cellspacing="2" cellpadding="4">');
        resultObj.body = common.urlConverter(dataArr[0], qObj);

        return resultObj;
    } catch (error) {
        resultObj.body = data;
        return resultObj;
    }
}
//결재 승인
async function agreeNreject(config, qObj, res, req) {

    var formdata = new FormData();
    var formDataUrl = config.host + qObj.formdata.openurl;
    // console.log(formDataUrl);
    var data = await axios({
        method: "get",
        url: formDataUrl,
        httpsAgent: agent,
        headers: {
            "Content-Type": "application/json",
            "Cookie": qObj.cookie
        },
    })
        .then((response) => {
            // console.log("**************** detail *******************");

            return response.data;
        })
        .catch((error) => {
            throw new Error(error);
        });
    // console.log(data);
    const $ = cheerio.load(data);
    $("input").each(function () {
        formdata.append($(this).attr("name"), $(this).val());
        // console.log($(this).attr("name"), " ", $(this).val());
        // formDataObj[$(this).attr("name")] = $(this).val();
    });
    // formdata.append("ChkXSSFNM", "chkLastEdit;From;DocKey;EditAppLine;sStopFlage;sRDocForm;sDocStep;AprNcount1;AprNcount2;ParallelStart;ParallelTcount;ParallelNcount;myinfo;curmyinfo;sCurFullList;sAppList1;sAppList2;sAppList1Back;sAppList2Back;sReqsAppList1;AprTcount1;AprTcount2;sAprHistory1;sAprHistory2;sReqsAprHistory1;SecurityChangeHistory;Conferenceis;sReceiveUsersFull;sReceiveUsersDisp;sReceiveUsersIDList;sAuditUsersFull;sAuditUsersIDList;sAgrReferenceUsersFull;sAgrReferenceUsersIDList;sReferenceUsersFull;sReferenceUsersIDList;OtherReadersFull;AprActionType;sStatus;TmpdocPermission;TmpServer;ActEvaluation;sComment1;sComment2;sReqsComment1");
    formdata.append("docstatus", qObj.formdata.approve);
    formdata.append("actiontype", qObj.formdata.approve);
    formdata.append("TmpsComment", qObj.formdata.comment + "†");
    // formdata.append("TmpServer", "CN=dappl1/O=SIS");
    // formdata.append("TmpdocPermission", "H0");
    // formdata.append("MIMESweeper", "1");

    var unid = util.strLeft(qObj.formdata.openurl, "?");
    var sumUrl = qObj.formdata.openurl.split('vdockey');
    qObj.unid = unid.slice(-32);
    // console.log(qObj.unid);

    var agreeUrl = sumUrl[0] + config.approval.agree;
    agreeUrl = agreeUrl.replace("#unid#", qObj.unid);
    console.log(agreeUrl);
    // console.log(formdata);

    await axios({
        method: "post",
        url: config.host + agreeUrl,

        headers: {
            "Content-Type": formdata.getHeaders()["content-type"],
            "Cookie": qObj.cookie,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.159 Safari/537.36"
        },
        data: formdata
    })
        .then((response) => {
            if (res.statusCode == 200) {
                console.log("******************* 완료 *******************");
                util.writeSuccess('Done', res);
            }
        })
        .catch((error) => {
            throw new Error(error);
        });



    // formdata.submit({
    //     host: config.submitHost,
    //     path: agreeUrl,
    //     headers: {
    //         'cookie': qObj.cookie
    //     }
    // }, function (err, resp) {
    //     if (err) throw err;
    //     // console.log(resp);
    //     if (res.statusCode == 200) {
    //         if (qObj.type == "agree") {
    //             console.log("******************* 승인 완료 *******************");
    //         }
    //         if (qObj.type == "reject") {
    //             console.log("******************* 거절 완료 *******************");
    //         }
    //     }

    //     util.writeSuccess('Done', res);
    // });
}
//기안문서 작성, 임시 저장
async function write(config, qObj, res, req) {
    var getDockeyUrl = config.host + config.approval.formDockey
    getDockeyUrl = getDockeyUrl.replace("#formCode#", qObj.formdata.formCode);
    getDockeyUrl = getDockeyUrl.replace("#comalias#", qObj.userInfo.comalias);
    // console.log(qObj);
    // console.log(getDockeyUrl);
    var data = await axios({
        method: "get",
        url: getDockeyUrl,
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
    const $ = cheerio.load(data);
    var dockey = $('input[name="DocKey"]').val();

    var formdata = new FormData();
    // console.log(dockey, "++++++++++++++++++++++++++++++++++");
    formdata.append("docstatus", qObj.formdata.approvalType); // raise : 기안문서 작성, draft : 임시저장
    formdata.append("actiontype", qObj.formdata.approvalType); // 위와 같음, 편집: saveadmin
    formdata.append("chkLastEdit", ""); // 
    formdata.append("From", qObj.formdata.From);        // 기안자 = "CN=배선일/OU=209002/O=SIS"
    formdata.append("DocKey", dockey);      // dockey = "202109011423113696D3478F8122B849258743001D96C9"
    formdata.append("myinfo", qObj.formdata.myinfo);    // 결재자 정보 = "AP^1^S^ko:배선일,en:Bae ...생략"
    formdata.append("curmyinfo", qObj.formdata.myinfo);  // 다음 결재자 정보 = "AP^1^S^ko:문현일,en:Moon Hyeonil...생략"
    formdata.append("sAppList1", qObj.formdata.sAppList1); // 결재선 정보 =
    formdata.append("sAppList2", qObj.formdata.sAppList2); // 주관부서 결재선 정보 =
    formdata.append("sReqsAppList1", qObj.formdata.myinfo);  // 결재자 정보 = "AP^1^S^ko:배선일,en:Bae ...생략"
    formdata.append("AprTcount1", qObj.formdata.AprTcount1); //총 결재 수 
    formdata.append("AprTcount2", qObj.formdata.AprTcount2); //주관부서 총 결재 수 
    formdata.append("TmpsComment", qObj.formdata.TmpsComment + "†"); // 코멘트 "TEXT"+"†" 결재 보내기 의견
    formdata.append("Subject", qObj.formdata.subject);
    // formdata.append("Body", qObj.formdata.body);
    formdata.append("DocPermission_Nm", qObj.formdata.DocPermission_Nm);
    formdata.append("DocPeriod", qObj.formdata.DocPeriod);  //년수랑 같음(준영구:40,영구:50)
    formdata.append("DocPeriod_Nm", qObj.formdata.DocPeriod_Nm); // 1년, 3년, ... 준영구, 영구
    formdata.append("TmpdocPermission", qObj.formdata.DocPermission); // 비공개(권한자만) : H0, 부분공개(부서) : H1, 전체공개 : H2
    formdata.append("DocPermission", qObj.formdata.DocPermission); // 비공개(권한자만) : H0, 부분공개(부서) : H1, 전체공개 : H2

    //첨부파일
    for (var attachInx = 0; attachInx < qObj.file.length; attachInx++) {
        //console.log("첨부 정보", qObj.file[attachInx].buffer);
        formdata.append("%%File", qObj.file[attachInx].buffer, { filename: qObj.file[attachInx].originalname });
    }
    //******************************************************************************************************************

    // 에이스테크 - 근태승인신청서
    formdata.append("person", qObj.formdata.person); // 근태대상자 T120014/김기필//차장//IT_Team T120068/박민희//차장//IT_Team
    formdata.append("plan", qObj.formdata.plan); // 야특근시 중점업무계획
    formdata.append("cause", qObj.formdata.cause); // 현지 퇴근 사유
    formdata.append("selCompany", qObj.formdata.selCompany); // 회사선택 2000
    formdata.append("selCompany_Nm", qObj.formdata.selCompany_Nm); // 회사선택 ACE Technologies
    formdata.append("AddOpinion", qObj.formdata.AddOpinion); // 추가의견
    formdata.append("division", qObj.formdata.division); // 근태구분 C1,C2...
    formdata.append("division_Nm", qObj.formdata.division_Nm); // 근태구분 년차,병가...
    formdata.append("reason", qObj.formdata.reason); // 사유

    // 기간
    formdata.append("ReqFrom", qObj.formdata.ReqFrom); // 2022-04-11 00:00:00 ZE9
    formdata.append("StartTime", qObj.formdata.StartTime); // 시작시
    formdata.append("EndTime", qObj.formdata.EndTime); // 시작분
    formdata.append("to", qObj.formdata.to); // 2022-04-15 00:00:00 ZE9
    formdata.append("StartTime_1", qObj.formdata.StartTime_1); // 종료시
    formdata.append("EndTime_1", qObj.formdata.EndTime_1); // 종료분

    // 주관부서
    formdata.append("sReceiveOrgName", qObj.formdata.sReceiveOrgName); // 다음 결재자 notesid  진성원/204010/SIS
    formdata.append("sReceiveOrgNameFull", qObj.formdata.sAppList2.replace("AP^1^", "")); // 다음결재자 정보  S^ko:진성원,en:Jin SeongWon^204010^진성원/204010/SIS^K-SIS_300001^K-SIS_200001^ko:수석연구원,en:Principal Research Engineer^K-SIS_50130^ko:수석연구원,en:Principal Research Engineer^K-SIS_50130^K-SIS^ko:Domino파트,en:Domino Part^ko:새롬정보,en:Saerom^^

    // 수신
    formdata.append("joint_owner", qObj.formdata.joint_owner);
    formdata.append("joint_ownerFull", qObj.formdata.joint_ownerFull);
    //******************************************************************************************************************

    formdata.append("__Click", "0");
    formdata.append("TmpsAppinfo", "");
    formdata.append("AutoUNID", "");
    formdata.append("ChkXSSFNM", "sCurIP;$approval;chkLastEdit;From;DocKey;EditAppLine;sStopFlage;sRDocForm;sDocStep;AprNcount1;AprNcount2;ParallelStart;ParallelTcount;ParallelNcount;myinfo;curmyinfo;sCurFullList;sAppList1;sAppList2;sAppList1Back;sAppList2Back;sReqsAppList1;AprTcount1;AprTcount2;sAprHistory1;sAprHistory2;sReqsAprHistory1;SecurityChangeHistory;Conferenceis;sReceiveUsersFull;sReceiveUsersDisp;sReceiveUsersIDList;sAuditUsersDisp;sAuditUsersFull;sAuditUsersIDList;sAgrReferenceUsersDisp;sAgrReferenceUsersFull;sAgrReferenceUsersIDList;sReferenceUsersFull;sReferenceUsersIDList;OtherReadersFull;AprActionType;sStatus;TmpdocPermission;TmpServer;ActEvaluation;sComment1;sComment2;sReqsComment1;sCircularLog;AddOpinion;Subject;division;division_Nm;reason;ReqFrom;to;cause");
    // formdata.append("ChkXSSFNM", "chkLastEdit;From;DocKey;EditAppLine;sStopFlage;sRDocForm;sDocStep;AprNcount1;AprNcount2;ParallelStart;ParallelTcount;ParallelNcount;myinfo;curmyinfo;sCurFullList;sAppList1;sAppList2;sAppList1Back;sAppList2Back;sReqsAppList1;AprTcount1;AprTcount2;sAprHistory1;sAprHistory2;sReqsAprHistory1;SecurityChangeHistory;Conferenceis;sReceiveUsersFull;sReceiveUsersDisp;sReceiveUsersIDList;sAuditUsersFull;sAuditUsersIDList;sAgrReferenceUsersFull;sAgrReferenceUsersIDList;sReferenceUsersFull;sReferenceUsersIDList;OtherReadersFull;AprActionType;sStatus;TmpdocPermission;TmpServer;ActEvaluation;sComment1;sComment2;sReqsComment1;sAdded");
    formdata.append("imgDataURL", "");
    formdata.append("mediaUrl", "");
    formdata.append("thumbPos", "0");
    formdata.append("thumbImgUrl", "");
    formdata.append("ApplCode", "aprv");
    formdata.append("$approval", "");
    formdata.append("chkLastEdit", "");
    formdata.append("EditAppLine", "");
    formdata.append("sStopFlage", "false");
    formdata.append("sRDocForm", "R");
    formdata.append("sDocStep", "1");
    formdata.append("sAppList1Back", "");// 
    formdata.append("sAppList2Back", ""); // 
    formdata.append("sCurFullList", ""); //현 결재자 정보 = "AG_P!@AG_M^3^S^ko:박상기,en:Pa ...생략"
    formdata.append("AprNcount1", "0");  //결재 완료 수 
    formdata.append("AprNcount2", "0"); //주관부서 결재 완료 수 
    formdata.append("ParallelStart", "");
    formdata.append("ParallelTcount", "");
    formdata.append("ParallelNcount", "");
    formdata.append("sAprHistory1", ""); // 현재까지 결재 정보 = "raise^2021-09-01T14:23:11+09:00^배선일/ ...생략"
    formdata.append("sAprHistory2", ""); //주관부서 현재까지 결재 정보
    formdata.append("sReqsAprHistory1", "");
    formdata.append("SecurityChangeHistory", "");
    formdata.append("Conferenceis", "");
    formdata.append("sReceiveUsersFull", "");
    formdata.append("sReceiveUsersDisp", "");
    formdata.append("sReceiveUsersIDList", "");
    formdata.append("sAuditUsersFull", "");
    formdata.append("sAuditUsersIDList", "");
    formdata.append("sAgrReferenceUsersDisp", "");
    formdata.append("sAgrReferenceUsersFull", "");
    formdata.append("sAgrReferenceUsersIDList", "");
    formdata.append("sReferenceUsersFull", "");
    formdata.append("sReferenceUsersIDList", "");
    formdata.append("OtherReadersFull", "");
    formdata.append("AprActionType", "");
    formdata.append("sStatus", "draft"); //진행 상태
    formdata.append("TmpServer", "CN=app01/O=acetech");
    formdata.append("ActEvaluation", "");
    formdata.append("sComment1", "");  //코멘트
    formdata.append("sComment2", ""); //주관부서 코멘트
    formdata.append("sReqsComment1", "");
    formdata.append("sReceiveOrgName_Disp", "");
    formdata.append("sReceiveOrgName_Full", "");
    formdata.append("sChangeAprvName", "");
    formdata.append("sChangeAprvName_Full", "");
    formdata.append("MIMESweeper", "1");
    formdata.append("guidanceBtn", "");
    formdata.append("sAdded", "");
    formdata.append("Multi_Attach_Type", "D");
    formdata.append("Multi_Attach_DBPath", "Error");
    formdata.append("Multi_Attach_Form", "fmUpload");
    // formdata.append("joint_owner", "");
    // formdata.append("joint_ownerFull", "");
    formdata.append("Multi_Attach_DocID", "");
    formdata.append("Multi_Attach_DeleteFile", "");
    formdata.append("Multi_Attach_Files", "");
    formdata.append("Multi_Attach_Info", "");
    formdata.append("Multi_Attach_SortFiles", "");
    formdata.append("Multi_Attach_SortFilesSize", "");
    formdata.append("Already_Attach", "");
    formdata.append("Multi_Attach_BodyEmd", "0");
    formdata.append("BookMarks", "");

    var url = config.approval.formDockey;
    url = url.replace("#formCode#", qObj.formdata.formCode);
    url = url.replace("#comalias#", qObj.userInfo.comalias);

    console.log(config.submitHost, url);

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
            if (response.status == 200) {
                util.writeSuccess('Done', res);
            } else {
                console.log(response);
                return;
            }
        })
        .catch((error) => {
            throw new Error(error);
        });


    // formdata.submit({
    //     host: config.submitHost,
    //     path: url,
    //     headers: {
    //         'cookie': qObj.cookie
    //     }
    // }, function (err, resp) {
    //     if (err) throw err;
    //     if (res.statusCode == 200) {
    //         console.log("******************* 기안 완료 *******************");
    //     }

    //     util.writeSuccess('Done', res);
    // });
}
//결재중 문서 삭제
async function deleteItem(config, qObj, res, req) {
    var url = "";
    const formdata = new URLSearchParams();
    if (qObj.body.deleteType == "draft") {
        url = config.host + config.approval.deleteDraftItem;
        url = url.replace("#comalias#", qObj.userInfo.comalias);
        formdata.append("actiontype", "del_temp");
        formdata.append("postdata", qObj.body.unid);
    } else {
        url = config.host + config.approval.deleteItem;
        url = url.replace("#comalias#", qObj.userInfo.comalias);
        formdata.append("actiontype", "admindocdel");
        formdata.append("Unid", qObj.body.unid);
        formdata.append("wpopup", "1");
        formdata.append("wdid", "");
    }

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
            if (response.status == 200) {

                util.writeSuccess('Done', res);
                return;
            }
        })
        .catch((error) => {
            throw new Error(error);
        });
}
//회수
async function collect(config, qObj, res, req) {
    var url = config.host + config.approval.collect;
    const formdata = new URLSearchParams();

    formdata.append("ps", "15");
    formdata.append("page", "0");
    formdata.append("category", "209003");
    formdata.append("wdid", "1633651928590");

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
            if (response.status == 200) {

                util.writeSuccess('Done', res);
                return;
            }
        })
        .catch((error) => {
            throw new Error(error);
        });
}
//문서 편집
async function editItem(config, qObj, res, req) {
    // console.log(qObj);
    var formdata = new FormData();
    var formDataUrl = config.host + qObj.formdata.openurl;
    console.log(formDataUrl);
    var data = await axios({
        method: "get",
        url: formDataUrl,
        httpsAgent: agent,
        headers: {
            "Content-Type": "application/json",
            "Cookie": qObj.cookie
        },
    })
        .then((response) => {
            // console.log("**************** detail *******************");

            return response.data;
        })
        .catch((error) => {
            throw new Error(error);
        });
    // console.log(data);
    const $ = cheerio.load(data);
    $("input").each(function () {
        formdata.append($(this).attr("name"), $(this).val());
        // console.log($(this).attr("name"), " ", $(this).val());
        // formDataObj[$(this).attr("name")] = $(this).val();
    });
    // formdata.append("docstatus", qObj.formdata.approvalType); // raise : 기안문서 작성, draft : 임시저장

    // 기본
    // formdata.append("actiontype", "saveadmin"); // 위와 같음, 편집: saveadmin
    // formdata.append("Subject", qObj.formdata.subject);
    // formdata.append("From", qObj.formdata.From);        // 기안자 = "CN=배선일/OU=209002/O=SIS"
    // formdata.append("myinfo", qObj.formdata.myinfo);    // 결재자 정보 = "AP^1^S^ko:배선일,en:Bae ...생략"
    // formdata.append("curmyinfo", qObj.formdata.myinfo);  // 다음 결재자 정보 = "AP^1^S^ko:문현일,en:Moon Hyeonil...생략"
    // formdata.append("sAppList1", qObj.formdata.sAppList1); // 결재선 정보 =
    // formdata.append("sAppList2", qObj.formdata.sAppList2); // 주관부서 결재선 정보 =
    // formdata.append("sReqsAppList1", qObj.formdata.myinfo);  // 결재자 정보 = "AP^1^S^ko:배선일,en:Bae ...생략"
    // formdata.append("AprTcount1", qObj.formdata.AprTcount1); //총 결재 수 
    // formdata.append("AprTcount2", qObj.formdata.AprTcount2); //주관부서 총 결재 수 
    // formdata.append("Body", qObj.formdata.body);
    // formdata.append("DocPeriod", qObj.formdata.DocPeriod);  //년수랑 같은 영구만 99
    // formdata.append("TmpdocPermission", qObj.formdata.DocPermission); // 권한자만 공유 : H0, 부서공유 : H1, 사내공유 : H2
    // formdata.append("DocPermission", qObj.formdata.DocPermission); // 권한자만 공유 : H0, 부서공유 : H1, 사내공유 : H2


    // formdata.append("actiontype", qObj.formdata.actiontype);

    // //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // 근태승인신청서 편집
    formdata.append("docstatus", qObj.formdata.approvalType); // raise : 기안문서 작성, draft : 임시저장
    formdata.append("actiontype", qObj.formdata.approvalType); // 위와 같음, 편집: saveadmin
    formdata.append("chkLastEdit", ""); // 
    formdata.append("From", qObj.formdata.From);        // 기안자 = "CN=배선일/OU=209002/O=SIS"
    // formdata.append("DocKey", dockey);      // dockey = "202109011423113696D3478F8122B849258743001D96C9"
    formdata.append("myinfo", qObj.formdata.myinfo);    // 결재자 정보 = "AP^1^S^ko:배선일,en:Bae ...생략"
    formdata.append("curmyinfo", qObj.formdata.myinfo);  // 다음 결재자 정보 = "AP^1^S^ko:문현일,en:Moon Hyeonil...생략"
    formdata.append("sAppList1", qObj.formdata.sAppList1); // 결재선 정보 =
    formdata.append("sAppList2", qObj.formdata.sAppList2); // 주관부서 결재선 정보 =
    formdata.append("sReqsAppList1", qObj.formdata.myinfo);  // 결재자 정보 = "AP^1^S^ko:배선일,en:Bae ...생략"
    formdata.append("AprTcount1", qObj.formdata.AprTcount1); //총 결재 수 
    formdata.append("AprTcount2", qObj.formdata.AprTcount2); //주관부서 총 결재 수 
    formdata.append("TmpsComment", qObj.formdata.TmpsComment + "†"); // 코멘트 "TEXT"+"†" 결재 보내기 의견
    formdata.append("Subject", qObj.formdata.subject);
    // formdata.append("Body", qObj.formdata.body);
    formdata.append("DocPermission_Nm", qObj.formdata.DocPermission_Nm);
    formdata.append("DocPeriod", qObj.formdata.DocPeriod);  //년수랑 같음(준영구:40,영구:50)
    formdata.append("DocPeriod_Nm", qObj.formdata.DocPeriod_Nm); // 1년, 3년, ... 준영구, 영구
    formdata.append("TmpdocPermission", qObj.formdata.DocPermission); // 비공개(권한자만) : H0, 부분공개(부서) : H1, 전체공개 : H2
    formdata.append("DocPermission", qObj.formdata.DocPermission); // 비공개(권한자만) : H0, 부분공개(부서) : H1, 전체공개 : H2

    //첨부파일
    for (var attachInx = 0; attachInx < qObj.file.length; attachInx++) {
        //console.log("첨부 정보", qObj.file[attachInx].buffer);
        formdata.append("%%File", qObj.file[attachInx].buffer, { filename: qObj.file[attachInx].originalname });
    }
    //******************************************************************************************************************

    // 에이스테크 - 근태승인신청서
    formdata.append("person", qObj.formdata.person); // 근태대상자 T120014/김기필//차장//IT_Team T120068/박민희//차장//IT_Team
    formdata.append("plan", qObj.formdata.plan); // 야특근시 중점업무계획
    formdata.append("cause", qObj.formdata.cause); // 현지 퇴근 사유
    formdata.append("selCompany", qObj.formdata.selCompany); // 회사선택 2000
    formdata.append("selCompany_Nm", qObj.formdata.selCompany_Nm); // 회사선택 ACE Technologies
    formdata.append("AddOpinion", qObj.formdata.AddOpinion); // 추가의견
    formdata.append("division", qObj.formdata.division); // 근태구분 C1,C2...
    formdata.append("division_Nm", qObj.formdata.division_Nm); // 근태구분 년차,병가...
    formdata.append("reason", qObj.formdata.reason); // 사유

    // 기간
    formdata.append("ReqFrom", qObj.formdata.ReqFrom); // 2022-04-11 00:00:00 ZE9
    formdata.append("StartTime", qObj.formdata.StartTime); // 시작시
    formdata.append("EndTime", qObj.formdata.EndTime); // 시작분
    formdata.append("to", qObj.formdata.to); // 2022-04-15 00:00:00 ZE9
    formdata.append("StartTime_1", qObj.formdata.StartTime_1); // 종료시
    formdata.append("EndTime_1", qObj.formdata.EndTime_1); // 종료분

    // 주관부서
    formdata.append("sReceiveOrgName", qObj.formdata.sReceiveOrgName); // 다음 결재자 notesid  진성원/204010/SIS
    formdata.append("sReceiveOrgNameFull", qObj.formdata.sAppList2.replace("AP^1^", "")); // 다음결재자 정보  S^ko:진성원,en:Jin SeongWon^204010^진성원/204010/SIS^K-SIS_300001^K-SIS_200001^ko:수석연구원,en:Principal Research Engineer^K-SIS_50130^ko:수석연구원,en:Principal Research Engineer^K-SIS_50130^K-SIS^ko:Domino파트,en:Domino Part^ko:새롬정보,en:Saerom^^

    // 수신
    formdata.append("joint_owner", qObj.formdata.joint_owner);
    formdata.append("joint_ownerFull", qObj.formdata.joint_ownerFull);
    //******************************************************************************************************************

    formdata.append("__Click", "0");
    formdata.append("TmpsAppinfo", "");
    formdata.append("AutoUNID", "");
    formdata.append("ChkXSSFNM", "sCurIP;$approval;chkLastEdit;From;DocKey;EditAppLine;sStopFlage;sRDocForm;sDocStep;AprNcount1;AprNcount2;ParallelStart;ParallelTcount;ParallelNcount;myinfo;curmyinfo;sCurFullList;sAppList1;sAppList2;sAppList1Back;sAppList2Back;sReqsAppList1;AprTcount1;AprTcount2;sAprHistory1;sAprHistory2;sReqsAprHistory1;SecurityChangeHistory;Conferenceis;sReceiveUsersFull;sReceiveUsersDisp;sReceiveUsersIDList;sAuditUsersDisp;sAuditUsersFull;sAuditUsersIDList;sAgrReferenceUsersDisp;sAgrReferenceUsersFull;sAgrReferenceUsersIDList;sReferenceUsersFull;sReferenceUsersIDList;OtherReadersFull;AprActionType;sStatus;TmpdocPermission;TmpServer;ActEvaluation;sComment1;sComment2;sReqsComment1;sCircularLog;AddOpinion;Subject;division;division_Nm;reason;ReqFrom;to;cause");
    // formdata.append("ChkXSSFNM", "chkLastEdit;From;DocKey;EditAppLine;sStopFlage;sRDocForm;sDocStep;AprNcount1;AprNcount2;ParallelStart;ParallelTcount;ParallelNcount;myinfo;curmyinfo;sCurFullList;sAppList1;sAppList2;sAppList1Back;sAppList2Back;sReqsAppList1;AprTcount1;AprTcount2;sAprHistory1;sAprHistory2;sReqsAprHistory1;SecurityChangeHistory;Conferenceis;sReceiveUsersFull;sReceiveUsersDisp;sReceiveUsersIDList;sAuditUsersFull;sAuditUsersIDList;sAgrReferenceUsersFull;sAgrReferenceUsersIDList;sReferenceUsersFull;sReferenceUsersIDList;OtherReadersFull;AprActionType;sStatus;TmpdocPermission;TmpServer;ActEvaluation;sComment1;sComment2;sReqsComment1;sAdded");
    formdata.append("imgDataURL", "");
    formdata.append("mediaUrl", "");
    formdata.append("thumbPos", "0");
    formdata.append("thumbImgUrl", "");
    formdata.append("ApplCode", "aprv");
    formdata.append("$approval", "");
    formdata.append("chkLastEdit", "");
    formdata.append("EditAppLine", "");
    formdata.append("sStopFlage", "false");
    formdata.append("sRDocForm", "R");
    formdata.append("sDocStep", "1");
    formdata.append("sAppList1Back", "");// 
    formdata.append("sAppList2Back", ""); // 
    formdata.append("sCurFullList", ""); //현 결재자 정보 = "AG_P!@AG_M^3^S^ko:박상기,en:Pa ...생략"
    formdata.append("AprNcount1", "0");  //결재 완료 수 
    formdata.append("AprNcount2", "0"); //주관부서 결재 완료 수 
    formdata.append("ParallelStart", "");
    formdata.append("ParallelTcount", "");
    formdata.append("ParallelNcount", "");
    formdata.append("sAprHistory1", ""); // 현재까지 결재 정보 = "raise^2021-09-01T14:23:11+09:00^배선일/ ...생략"
    formdata.append("sAprHistory2", ""); //주관부서 현재까지 결재 정보
    formdata.append("sReqsAprHistory1", "");
    formdata.append("SecurityChangeHistory", "");
    formdata.append("Conferenceis", "");
    formdata.append("sReceiveUsersFull", "");
    formdata.append("sReceiveUsersDisp", "");
    formdata.append("sReceiveUsersIDList", "");
    formdata.append("sAuditUsersFull", "");
    formdata.append("sAuditUsersIDList", "");
    formdata.append("sAgrReferenceUsersDisp", "");
    formdata.append("sAgrReferenceUsersFull", "");
    formdata.append("sAgrReferenceUsersIDList", "");
    formdata.append("sReferenceUsersFull", "");
    formdata.append("sReferenceUsersIDList", "");
    formdata.append("OtherReadersFull", "");
    formdata.append("AprActionType", "");
    formdata.append("sStatus", "draft"); //진행 상태
    formdata.append("TmpServer", "CN=app01/O=acetech");
    formdata.append("ActEvaluation", "");
    formdata.append("sComment1", "");  //코멘트
    formdata.append("sComment2", ""); //주관부서 코멘트
    formdata.append("sReqsComment1", "");
    formdata.append("sReceiveOrgName_Disp", "");
    formdata.append("sReceiveOrgName_Full", "");
    formdata.append("sChangeAprvName", "");
    formdata.append("sChangeAprvName_Full", "");
    formdata.append("MIMESweeper", "1");
    formdata.append("guidanceBtn", "");
    formdata.append("sAdded", "");
    formdata.append("Multi_Attach_Type", "D");
    formdata.append("Multi_Attach_DBPath", "Error");
    formdata.append("Multi_Attach_Form", "fmUpload");
    // formdata.append("joint_owner", "");
    // formdata.append("joint_ownerFull", "");
    formdata.append("Multi_Attach_DocID", "");
    formdata.append("Multi_Attach_DeleteFile", "");
    formdata.append("Multi_Attach_Files", "");
    formdata.append("Multi_Attach_Info", "");
    formdata.append("Multi_Attach_SortFiles", "");
    formdata.append("Multi_Attach_SortFilesSize", "");
    formdata.append("Already_Attach", "");
    formdata.append("Multi_Attach_BodyEmd", "0");
    formdata.append("BookMarks", "");
    // //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    var unid = util.strLeft(qObj.formdata.openurl, "?");
    var sumUrl = qObj.formdata.openurl.split('vdockey');
    qObj.unid = unid.slice(-32);
    // console.log(qObj.unid);

    var agreeUrl = sumUrl[0] + config.approval.editItem;
    agreeUrl = agreeUrl.replace("#unid#", qObj.unid);
    console.log(agreeUrl);

    // //첨부파일
    // for (var attachInx = 0; attachInx < qObj.file.length; attachInx++) {
    //     //console.log("첨부 정보", qObj.file[attachInx].buffer);
    //     formdata.append("%%File", qObj.file[attachInx].buffer, { filename: qObj.file[attachInx].originalname });
    // }
    try {
        var detachArr = qObj.formdata.Detach.split(";");
        for (var detachIdx = 0; detachIdx < detachArr.length; detachIdx++) {
            formdata.append("%%Detach", detachArr[detachIdx]); //기존 첨부에서 빠진 파일 이름
        }
    } catch (e) {
        formdata.append("%%Detach", ""); //기존 첨부에서 빠진 파일 이름

    }

    // https://gw.ace-group.co.kr/dwp/acegroup/workflow/aprv/aprvstart.nsf/vdockey/202204111956354D6CF6AEF88BEEB249258821003C1CB4?EditDocument&Seq=1&popup=1
    var getDockeyUrl = config.approval.editDockey;
    getDockeyUrl = getDockeyUrl.replace("#comalias#", qObj.userInfo.comalias);
    getDockeyUrl = getDockeyUrl.replace("#dockey#", unid.split("dockey/")[1]);

    await axios({
        method: "post",
        url: config.host + getDockeyUrl,

        headers: {
            "Content-Type": formdata.getHeaders()["content-type"],
            "Cookie": qObj.cookie,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.159 Safari/537.36"
        },
        data: formdata
    })
        .then((response) => {
            if (response.status == 200) {
                util.writeSuccess('Done', res);
            } else {
                console.log(response);
                return;
            }
        })
        .catch((error) => {
            throw new Error(error);
        });

    // formdata.submit({
    //     host: config.submitHost,
    //     path: agreeUrl,
    //     headers: {
    //         'cookie': qObj.cookie
    //     }
    // }, function (err, resp) {
    //     if (err) throw err;
    //     // console.log(resp);
    //     if (res.statusCode == 200) {
    //         console.log("편집완료");
    //     }

    //     util.writeSuccess('Done', res);
    // });
}
//결재문서 편집 전 결재선 정보 넘기기
async function peopleInfo(config, qObj, res, req) {
    var url = `${config.elastic_address[config.version]}/${config.elasticPersonDB}/_search`;
    const id = config.elastic_id + ":" + config.elastic_pw;
    var authorization = Buffer.from(id, "utf8").toString("base64");
    var query = `{
            "query": {
              "match": {
                "empno": "${qObj.empno}"
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

        // orgArr[orgInx] = orgObj;
        resultObj.peopleInfo = orgObj;
    }
    return resultObj;
}
//결재 양식 옵션 구하기
async function formSetting(config, qObj, res, req) {
    var url = config.host + config.approval.formSetting;
    url = url.replace("#unid#", qObj.unid);
    console.log(url);
    var formSetting = await axios({
        method: "get",
        url: url,
        httpsAgent: agent,
        headers: {
            "Content-Type": "application/json",
            "Cookie": qObj.cookie
        },
    })
        .then((response) => {
            // console.log("**************** detail *******************");

            return response.data;
        })
        .catch((error) => {
            throw new Error(error);
        });
    const $ = cheerio.load(formSetting);
    var appList2Default = $("input[name='Duty']").val();
    var empnoArr = appList2Default.split("/");
    qObj.empno = empnoArr[1];
    var result = await peopleInfo(config, qObj, res, req);
    var resultObj = {};
    resultObj.appList2_default = result.peopleInfo;
    util.writeSuccess(resultObj, res);
}
//결재 상세보기 옵션 구하기(사용안함, 편집 기능 추가시 사용)
async function detailFormOption(config, qObj, res, req) {
    var url = config.host + config.approval.formList_all_web;
    url = url.replace("#companycode#", qObj.userInfo["companycode"]);
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
            console.log("**************** 결재 양식 전체 리스트*******************");

            return response.data;
        })
        .catch((error) => {
            throw new Error(error);
        });
    var formUnid = ""

    for (var formListIdx = 0; formListIdx < result.length; formListIdx++) {
        if (qObj.formCode == result[formListIdx]["_formalias"]) {
            formUnid = result[formListIdx]["@unid"];
        }
    }

    var url = config.host + config.approval.detailFormOption;
    url = url.replace("#unid#", formUnid);
    console.log(url);
    if (formUnid != "") {

    }
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
            console.log("**************** 결재 양식 옵션*******************");

            return response.data;
        })
        .catch((error) => {
            throw new Error(error);
        });
    const $ = cheerio.load(data);
    if ($("div.dwp-selection-group[data-xlang-code='aprv_mng.data.etc']").attr("data-xlang-value") == "R") {
        return false;
    } else {
        return true;
    }
}

// 근태승인신청서 양식 옵션 구하기
const getDataInfo_axios = async (config, qObj, res, req) => {
    qObj.config = config;
    qObj.res = res;

    var ret = {};
    // "http://gw.ace-group.co.kr/dwp/ACEGROUP/workflow/aprv/aprvstart.nsf/wFrmApprove?openform&FormCode=ACEGROUP_attendanceform&popup=1"
    var url = config.host + config.approval.attendanceform;
    url = url.replaceAll("#comalias#", qObj.userInfo.comalias);
    try {
        axios({
            method: "GET",
            url: url,
            headers: {
                "Cookie": qObj.cookie
            },
        }).then(function (response) {
            var content = response.data;
            const $ = cheerio.load(content);

            //sReceiveOrgNameFull : 주관담당자 모든 정보 필드
            var sReceiveOrgNameFull = $("input[name=sReceiveOrgNameFull]").val();
            var sReceiveOrgNameArr = sReceiveOrgNameFull.split("^");

            //주관담당자 모든 정보 필드에서 이름을 추출하고 다국어에 맞는 값을 추출
            var namesArr = sReceiveOrgNameArr[1];
            var names = namesArr.split(",");
            var name = "";
            for (var index = 0; index < names.length; index++) {
                var temp = names[index];
                temp = temp.trim();
                if (temp.indexOf(qObj.language) > -1) {
                    name = util.strRight(temp, qObj.language + ":");
                    break;
                }
            }

            //주관담당자 모든 정보 필드에서 직급을 추출하고 다국어에 맞는 값을 추출
            var positionArr = sReceiveOrgNameArr[6];
            var positions = positionArr.split(",");
            for (var index = 0; index < positions.length; index++) {
                var temp = positions[index];
                temp = temp.trim();
                if (temp.indexOf(qObj.language) > -1) {
                    position = util.strRight(temp, qObj.language + ":");
                    break;
                }
            }
            //주관담당자 모든 정보 필드에서 이름 / 직급을 조합
            ret["sReceiveOrgName_NM"] = name + "/" + position;

            //주관담당자 모든 정보 필드에서 NotesName을 추출
            var notesname = sReceiveOrgNameArr[3];
            ret["sReceiveOrgName"] = notesname;

            var code_Arr = [];
            $(".dwp-selectbox").children().each(function (i, elem) {
                var xlang_src = $(this).attr("data-xlang-src");
                if (typeof xlang_src == undefined || typeof xlang_src == "undefined" || xlang_src == "" || xlang_src == null) {
                } else {
                    if (xlang_src.toLowerCase() == "cdb") {
                        var xlang_code = $(this).attr("data-xlang-code");
                        if (typeof xlang_code == undefined || typeof xlang_code == "undefined" || xlang_code == "" || xlang_code == null) {
                        } else {
                            //codebook 값 추출
                            code_Arr.push(xlang_code);
                        }
                    }
                }
            });

            //codebook 호출
            getDataInfo_codebook(ret, code_Arr, qObj);
        })
    } catch (error) {
        console.error(error);
    } finally {
        return ret;
    }
}

// 전자결재 양식 동적으로 가져오기
const getDataInfo_codebook = async (ret2, code_Arr, qObj) => {
    var ret = ret2;
    try {
        ret["default"] = {};
        var url = "";
        for (var index = 0; index < code_Arr.length; index++) {
            var categoryVal = code_Arr[index];
            categoryVal = categoryVal.replace(/\./gi, "_");
            url = config.host + config.approval.attendanceformCode + categoryVal;

            // key 값 설정
            if (categoryVal === "AP0001_SELCOMPANY") {
                // categoryVal = "AP0001_SELCOMPANY";
                categoryVal = "selCompany";
            } else if (categoryVal === "aprv_attendanceform_division") {
                // categoryVal = "aprv_attendanceform_division";
                categoryVal = "division";
            }

            var codebook = await axios({
                method: "GET",
                url: url,
                headers: {
                    "Cookie": qObj.cookie
                },
            }).then(function (response) {
                var res = {}
                var responsess = response.data;
                var isDefault = true;
                for (var index = 0; index < responsess.length; index++) {
                    var obj = responsess[index];
                    if (typeof obj == undefined || typeof obj == "undefined" || obj == "" || obj == null) {
                    } else {
                        if (obj["_type"].toLowerCase() == "CODE".toLowerCase()) {
                            res[obj["_code"]] = obj["_codenm"];

                            if (isDefault) {
                                ret["default"][categoryVal] = obj["_code"];
                                isDefault = false;
                            }
                        }
                    }
                }

                return res;
            });

            ret[categoryVal] = codebook;
        }

        // console.log("### ret : ", ret);
        // 조직도 가져오기
        getOrgData(ret, qObj);

    } catch (error) {
        console.error(error);
    } finally {
        return ret;
    }
}

// 주관부서 담당 조직도에서 정보 가져오기
const getOrgData = async (ret, qObj) => {
    let config = qObj.config;
    let res = qObj.res;

    url = `${config.elastic_address[config.version]}/${config.elasticPersonDB}/_search`;

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
                                {"term": {"@id": "${ret.sReceiveOrgName}"}}
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
            // throw new Error(error);
            return [];
        });
    var orgArr = [];
    try {
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
        ret["Org_id"] = orgArr;
    } catch (error) {
        ret["Org_id"] = [];
    }

    if (qObj.formOption) {
        await getDetailItem(ret, qObj);
        return;
    } else {
        util.writeSuccess(ret, res);
        return;
    }
}
module.exports = { get, post, put, del };