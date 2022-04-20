const util = require("../lib/util.js");
const common = require("../lib/common.js");
const logger = require("../lib/log.js");
const config = require("../config/config.json");
const path = require("path");
const axios = require("axios");
const cheerio = require('cheerio');
var moment = require("moment");
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
    var languageArr = qObj.cookie.split(";");
    var language = "";
    for (i = 0; i < languageArr.length; i++) {
        if (languageArr[i].indexOf("language") > -1) {
            var find = languageArr[i].split("=")
            qObj.language = find[1];
        }
    }
    //console.log(qObj.language);
    var userInfo = await common.getUserInfo(qObj);
    //console.log(userInfo);
    var url = "";
    if (qObj.type === 'notice') {
        //공지사항
        url = config.host + config.board.notice;
        url = url.replace(/#size#/, qObj.size);
        url = url.replace(/#page#/, qObj.page);
        url = url.replace(/#category#/, userInfo["companycode"]);
        console.log(url);
        await getItemList(config, qObj, res, req, url);
    } else if (qObj.type === 'recent') {
        var size = qObj.size;
        //경조사
        var url = config.host + config.board.congratulate;
        url = url.replace(/#size#/, size);
        url = url.replace(/#page#/, qObj.page);
        url = url.replace(/#category#/, userInfo["companycode"]);
        var congratulateData = await getItemList(config, qObj, res, req, url);
        //교육
        // url = config.host + config.board.education;
        // url = url.replace(/#size#/, size);
        // url = url.replace(/#page#/, qObj.page);
        // url = url.replace(/#category#/, qObj.lnbid);
        // var educationData = await getItemList(config, qObj, res, req, url);
        //공지사항
        url = config.host + config.board.notice;
        url = url.replace(/#size#/, size);
        url = url.replace(/#page#/, qObj.page);
        url = url.replace(/#category#/, userInfo["companycode"]);
        var noticeData = await getItemList(config, qObj, res, req, url);
        // console.log(noticeData);
        var dataArr = [];
        var count = 0;
        for (var i = 0; i < size; i++) {
            try {
                congratulateData[i]["created"] = congratulateData[i]["created"].replace("T", "");
                congratulateData[i]["boardType"] = "congratulate";
                dataArr[count] = congratulateData[i];
                count++;
            } catch (e) {
                break;
            }
        }
        // for (var i = 0; i < size; i++) {
        //     educationData[i]["created"] = educationData[i]["created"].replace("T", "");
        //     educationData[i]["category"] = "교육";
        //     educationData[i]["boardType"] = "education";
        //     dataArr[count] = educationData[i];
        //     count++;
        // }
        for (var i = 0; i < size; i++) {
            try {
                noticeData[i]["created"] = noticeData[i]["created"].replace("T", "");
                // noticeData[i]["category"] = "공지";
                noticeData[i]["boardType"] = "notice";
                dataArr[count] = noticeData[i];
                count++;
            } catch (e) {
                break;
            }
        }
        dataArr.sort(function (a, b) {
            return b["created"] - a["created"];
        });
        for (var x = 0; x < dataArr.length; x++) {
            dataArr[x]["created"] = moment(dataArr[x]["created"], "YYYYMMDDHHmmss").format("YYYYMMDDTHHmmss");
        }
        var resultObj = [];
        for (var resultIdx = 0; resultIdx < dataArr.length; resultIdx++) {
            resultObj[resultIdx] = dataArr[resultIdx];
        }

        util.writeSuccess(resultObj.slice(0, size), res);
    } else if (qObj.type === 'congratulate') {
        var url = config.host + config.board.congratulate;
        url = url.replace(/#size#/, qObj.size);
        url = url.replace(/#page#/, qObj.page);
        url = url.replace(/#category#/, userInfo["companycode"]);
        console.log(url);
        await getItemList(config, qObj, res, req, url);
    } else if (qObj.type === 'ceo') {
        var url = config.host + config.board.ceo;
        url = url.replace(/#size#/, qObj.size);
        url = url.replace(/#page#/, qObj.page);
        url = url.replace(/#category#/, userInfo["companycode"]);
        console.log(url);
        await getItemList(config, qObj, res, req, url);
    } else if (qObj.type === 'board') {
        url = config.host + config.board.freeBoard;
        url = url.replace("#freeBoardDB#", config.freeBoardDB);
        //자유게시판일때는 lnbid의 리스트중 첫번째  게시판을 가져옴
        if (qObj.lnbid == config.freeBoardLnb) {
            var firstLnbid = await firstFreeBoard(config, qObj, res, req);
            console.log(firstLnbid, "?????????????????");
            qObj.lnbid = firstLnbid;
        }
        url = url.replace(/#size#/, qObj.size);
        url = url.replace(/#page#/, qObj.page);
        url = url.replace(/#category#/, qObj.lnbid);
        console.log(url);
        if (qObj.lnbid == "") {
            util.writeSuccess([], res);
        } else {
            await getItemList(config, qObj, res, req, url);
        }
    } else if (qObj.type === 'detail') {
        if (qObj.boardType == "congratulate") {
            url = config.host + config.board.detail_congratulate;
            url = url.replace("#unid#", qObj.unid);
        } if (qObj.boardType == "board") {
            url = config.host + config.board.detail_freeBoard;
            url = url.replace("#unid#", qObj.unid);
            url = url.replace("#freeBoardDB#", config.freeBoardDB);
        } if (qObj.boardType == "notice") {
            url = config.host + config.board.detail_notice;
            url = url.replace("#unid#", qObj.unid);
        }
        await getDetail(config, qObj, res, req, url);
    } else if (qObj.type === 'getEditField') {
        getEditField(config, qObj, res, req);
    } else if (qObj.type === "search") {
        var userInfo = await common.getUserInfo(qObj);
        switch (qObj.boardType) {
            case "notice":
                url = config.host + config.board.search_notice;
                qObj.search = `((Field AuthorComCode=${userInfo["companycode"]}) ) and (`; break;
            case "board":
                url = config.host + config.board.search_freeBoard;
                url = url.replace("#freeBoardDB#", config.freeBoardDB);
                qObj.search = `(([boardid]=${qObj.lnbid})) and (`; break;
            case "congratulate":
                url = config.host + config.board.search_congratulate;
                qObj.search = `(`; break;
        }
        url = url.replace(/#size#/, qObj.size);
        url = url.replace(/#page#/, qObj.page);
        await getBoardSearch(qObj, res, req, url);
    } else if (qObj.type === "replyInfo") {
        var reply = await getReply(config, qObj, res, req);
        util.writeSuccess(reply, res);
    } else if (qObj.type === "getBoardSet") {
        getBoardSet(config, qObj, res, req);
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
    var url = "";
    if (qObj.type === "write_congratulate") {
        url = config.board.write_congratulate;
        url = url.replace("#single#", userInfo["companycode"]);
        await write(config, qObj, res, req, url);
    } else if (qObj.type === "write_notice") {
        url = config.board.write_notice;
        url = url.replace("#curcompany#", userInfo["companycode"]);
        await write(config, qObj, res, req, url);
    } else if (qObj.type === "write_board") {
        url = config.board.write_freeBoard;
        url = url.replace("#lnbid#", qObj.formdata.lnbid);
        url = url.replace("#freeBoardDB#", config.freeBoardDB);
        url = url.replace("#freeBoardLnb#", config.freeBoardLnb);
        console.log(url);
        // console.log(url,"5555555555555555555555555555555555555555555555");
        await write(config, qObj, res, req, url);
    } else if (qObj.type === "wrtie_reply") {
        await writeReply(config, qObj, res, req);
    } else if (qObj.type === "likeIt") {
        likeIt(config, qObj, res, req);
    } else if (qObj.type === "editItem_congratulate") {
        url = config.board.editItem_congratulate;
        url = url.replace("#unid#", qObj.formdata.unid);
        await write(config, qObj, res, req, url);
    } else if (qObj.type === "editItem_board") {
        url = config.board.editItem_freeBoard;
        url = url.replace("#unid#", qObj.formdata.unid);
        url = url.replace("#freeBoardDB#", config.freeBoardDB);
        await write(config, qObj, res, req, url);
    } else if (qObj.type === "editItem_notice") {
        url = config.board.editItem_notice;
        url = url.replace("#unid#", qObj.formdata.unid);
        await write(config, qObj, res, req, url);
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
    if (qObj.type == "delete_reply") {
        deleteReply(config, qObj, res, req);
    } else if (qObj.type == "delete_item") {
        deletedItem(config, qObj, res, req);
    }
};
//게시판 목록
async function getItemList(config, qObj, res, req, url) {
    var data = await axios({
        method: "get",
        url: url,
        httpsAgent: agent,
        headers: {
            "Content-Type": "application/json",
            "Cookie": qObj.cookie
        }
    })
        .then((response) => {
            console.log("************ 게시판 list ***********");
            // console.log(response.data);
            return response.data;
        })
        .catch((error) => {
            // throw new Error(error);
            return [];
        });
    // console.log(data);
    var resultArr = [];
    for (var dataIdx = 0; dataIdx < data.length; dataIdx++) {
        var resultObj = {};
        resultObj.unid = data[dataIdx]["@unid"];
        resultObj.subject = data[dataIdx]["_subject"];
        // resultObj.author = 
        var authorArr = data[dataIdx]["_author"].split(",");
        for (var authorIdx = 0; authorIdx < authorArr.length; authorIdx++) {
            if (qObj.language == "ko") {
                if (authorArr[authorIdx].indexOf("ko") > -1) {
                    resultObj.author = util.strRight(authorArr[authorIdx], "ko:");
                }
            } else if (qObj.language == "en") {
                if (authorArr[authorIdx].indexOf("en") > -1) {
                    resultObj.author = util.strRight(authorArr[authorIdx], "en:");
                }
            }
        }
        resultObj.created = moment(data[dataIdx]["_created"]).utc().format("YYYYMMDDTHHmmss");
        if (data[dataIdx]["_attach"] == "true") {
            resultObj.attach = true;
        } else if (data[dataIdx]["_attach"] == "false") {
            resultObj.attach = false;
        }
        if (qObj.type === "notice") {
            // resultObj.category = "공지";
        } else if (qObj.type === "congratulate") {
            resultObj.category = data[dataIdx]["_category1"];
        } else {
            try {
                var categoryArr = data[dataIdx]["_category"].split(",");
                //ko:테스트,en:test,zh:tttt
                for (var i = 0; i < categoryArr.length; i++) {
                    var findArr = categoryArr[i].split(":");
                    for (var j = 0; j < findArr.length; j++) {
                        if (findArr[0].toLowerCase() == qObj.language.toLowerCase()) {
                            resultObj.category = findArr[1];
                        }
                    }
                }
            } catch (e) {
                resultObj.category = "";
            }
        }
        resultObj.readcnt = data[dataIdx]["_readcnt"];
        resultObj.root_unid = data[dataIdx]["_key_unid"];
        resultObj.likecnt = data[dataIdx]["_likecnt"];
        resultArr[dataIdx] = resultObj;
    }
    if (qObj.type === "recent") {
        return resultArr;
    } else {
        util.writeSuccess(resultArr, res);
    }
}
//게시판 작성, 수정
async function write(config, qObj, res, req, url) {

    var formdata = new FormData();

    formdata.append("__Click", "0");
    formdata.append("docstatus", "reg");
    formdata.append("actiontype", "save");
    formdata.append("AutoUNID", "");
    formdata.append("imgDataURL", "");
    formdata.append("mediaUrl", "");
    formdata.append("thumbPos", "0");
    formdata.append("thumbImgUrl", "");
    formdata.append("Body_ko", "");
    formdata.append("Multi_Attach_Type", "D");
    formdata.append("Multi_Attach_DBPath", "Error");
    formdata.append("Multi_Attach_Form", "fmUpload");
    formdata.append("Multi_Attach_DocID", "");
    formdata.append("Multi_Attach_DeleteFile", "");
    formdata.append("Multi_Attach_Files", "");
    formdata.append("Multi_Attach_Info", "");
    formdata.append("Multi_Attach_SortFiles", "");
    formdata.append("Multi_Attach_SortFilesSize", "");
    // 제목
    formdata.append("Subject", qObj.formdata.subject);
    // body
    formdata.append("Body", qObj.formdata.body);
    formdata.append("bSummary", qObj.formdata.body);
    if (qObj.type === "write_congratulate") {
        formdata.append("ApplCode", "famevent");
        formdata.append("ChkXSSFNM", "FromDate;ToDate;Subject");
    } else if (qObj.type === "write_board") {
        formdata.append("ApplCode", "sbrd01");
        formdata.append("ChkXSSFNM", "FromDate;ToDate;Subject");
    } else if (qObj.type === "write_notice") {
        formdata.append("ApplCode", "notice01");
        formdata.append("ChkXSSFNM", "FromDate;ToDate;Subject");
    }
    // 댓글 허용안함 = 0, 허용 = 1
    if (qObj.formdata.isAllowReply == "1") {
        formdata.append("IsAllowReply", "1");
        formdata.append("IsAllowReply_Nm", "허용");
    } else if (qObj.formdata.isAllowReply == "0") {
        formdata.append("IsAllowReply", "0");
        formdata.append("IsAllowReply_Nm", "허용안함");
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


    if (qObj.type === "write_notice" || qObj.type === "write_board") {
        formdata.append("isTopFix", "");
        if (qObj.type === "write_board") {
            formdata.append("MIMESweeper", "1");
            try {
                formdata.append("Category", qObj.formdata.categoryall);
                formdata.append("Category_Nm", qObj.formdata.categoryall_nm);
            } catch (e) {
                formdata.append("Category", "");
                formdata.append("Category_Nm", "");
            }
        }
    }

    if (qObj.type === "write_congratulate" || qObj.type === "write_notice" || qObj.type === "editItem_notice" || qObj.type === "editItem_congratulate") {
        formdata.append("BookMarks", "");
        formdata.append("button", "");
        formdata.append("button", "");
        formdata.append("button", "");
        formdata.append("CommonGroups", "");
        formdata.append("CommonGroups_nm", "");

        if (qObj.type === "write_congratulate" || qObj.type === "editItem_congratulate") {
            formdata.append("BoardDocReaders", "");
            formdata.append("BoardDocReadersFull", "");
            formdata.append("qsearch", "");
            // 경사 = congratulate, 조사 = condolences
            if (qObj.formdata.category1 == "congratulate" || qObj.formdata.categoryall == "congratulate") {
                formdata.append("category1", "congratulate");
                formdata.append("category1_Nm", "경사");
            } else if (qObj.formdata.category1 == "condolences" || qObj.formdata.categoryall == "condolences") {
                formdata.append("category1", "condolences");
                formdata.append("category1_Nm", "조사");
            }
        } else if (qObj.type === "write_notice" || qObj.type === "editItem_notice") {
            //영구 작성

            formdata.append("IsEternity", qObj.formdata.isEternity);
            formdata.append("workposition_Nm", "ko:서울,en:Seoul,zh:首尔");

            try {
                formdata.append("FromDate", qObj.formdata.FromDate);
                formdata.append("ToDate", qObj.formdata.ToDate);

            } catch (e) {
                console.log(e);
                formdata.append("FromDate", "");
                formdata.append("ToDate", "");
            }
            formdata.append("workposition", "0001");
        }
    } else {
        formdata.append("IsEternity", qObj.formdata.isEternity);
        formdata.append("workposition_Nm", "ko:서울,en:Seoul,zh:首尔");
        try {
            formdata.append("FromDate", qObj.formdata.FromDate);
            formdata.append("ToDate", qObj.formdata.ToDate);

        } catch (e) {
            console.log(e);
            formdata.append("FromDate", "");
            formdata.append("ToDate", "");
        }
    }
    // console.log(formdata, "formdataformdataformdataformdataformdata");
    console.log(config.host + url, "?????????????????????????????");
    await axios({
        method: "post",
        url: config.host + url,
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
                console.log("******************* 게시물 작성 완료 *******************");
                util.writeSuccess('Done', res);
            } else {
                console.log(response);
                return;
            }
        })
        .catch((error) => {
            console.log(error);
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
    //         console.log("******************* 게시물 작성 완료 *******************");
    //     }

    //     util.writeSuccess('Done', res);
    // });
}
//게시판 상세보기
async function getDetail(config, qObj, res, req, url) {
    console.log(url);
    var data = await axios({
        method: "get",
        url: url,
        httpsAgent: agent,
        headers: {
            "Content-Type": "application/json",
            "Cookie": qObj.cookie
        }
    })
        .then((response) => {
            console.log("************ 게시판 detail ***********");
            console.log(response.data);
            return response.data;
        })
        .catch((error) => {
            // throw new Error(error);
            return [];
        });
    // console.log(data, "SSSSSSSSSSSS");
    const $ = cheerio.load(data);
    var resultObj = {};
    var subject = "";
    resultObj.unid = qObj.unid;

    var root_unid = util.strRight(data, "key_unid : ");
    root_unid = util.strLeft(root_unid, ",");
    root_unid = root_unid.replace(/^\s+|\s+$/gm, '');
    root_unid = root_unid.slice(1, -1);

    resultObj.root_unid = root_unid;
    qObj.root_unid = root_unid;

    // try {
    //     var root_unid = data.match(/key_unid : '(.*)'/);
    //     resultObj.root_unid = root_unid[1];
    //     qObj.root_unid = root_unid[1];
    // } catch (e) {
    //     var root_unid = data.match(/key_unid : "(.*)"/);
    //     resultObj.root_unid = root_unid[1];
    //     qObj.root_unid = root_unid[1];
    // }

    // console.log(root_unid);
    var dateArr = [];

    if ($("div.dwp-date-form").text() != "") {
        $("div.dwp-date-form").each(function (index) {
            if ($(this).parent().find("span[data-xlang='LC_TIME']").length == 2) {
                $(this).parent().find("span[data-xlang='LC_TIME']").each(function (index, item) {
                    dateArr[index] = $(item).attr("data-xlang-code");
                    resultObj.startDate = moment(dateArr[0], "YYYY-MM-DD").utc().format("YYYYMMDDTHHmmss");
                    resultObj.endDate = moment(dateArr[1], "YYYY-MM-DD").utc().format("YYYYMMDDTHHmmss");
                    resultObj.isEternity = false;
                });
            } else {
                resultObj.isEternity = true;
            }
        });
    } else {
        resultObj.isEternity = false;
    }

    resultObj.subject = $('div.dwp-page-title').text().replace(/^\s+|\s+$/gm, '');
    resultObj.subject = resultObj.subject === "" ? $('div.dwp-subject').text().replace(/^\s+|\s+$/gm, '') : resultObj.subject;

    var author = $('p.dwp-writer').text();
    author = author.replace(/\t/g, "");
    author = author.replace(/\n/g, "");

    if (author === "") {
        author = $('div.name').attr("data-xlang-txt");
        let rank = $('div.rank').attr("data-xlang-txt");
        let team = $('div.team').attr("data-xlang-txt");

        author = author.replace(/\t/g, "");
        author = author.replace(/\n/g, "");
        rank = rank.replace(/\t/g, "");
        rank = rank.replace(/\n/g, "");
        team = team.replace(/\t/g, "");
        team = team.replace(/\n/g, "");

        var authorArr = author.split(',');
        var rankrArr = rank.split(',');
        var teamArr = team.split(',');
        for (let i in authorArr) {
            if (qObj.language === authorArr[i].split(":")[0]) {
                resultObj.author = authorArr[i].split(":")[1].replace(/^\s+|\s+$/gm, '');
            }
            if (qObj.language === rankrArr[i].split(":")[0]) {
                resultObj.author += " " + rankrArr[i].split(":")[1].replace(/^\s+|\s+$/gm, '');
            }
            if (qObj.language === teamArr[i].split(":")[0]) {
                resultObj.author += " / " + teamArr[i].split(":")[1].replace(/^\s+|\s+$/gm, '');
            }
        }

        resultObj.read_cnt = $('span[class="view "]').text();
        resultObj.reply_cnt = $('span[name="replycnt"]').text();
    } else {
        // console.log("author", author);
        if (author != "") {
            var authorArr = author.split(':');
            resultObj.author = authorArr[0].replace(/^\s+|\s+$/gm, '');
            resultObj.read_cnt = authorArr[1].replace(/^\s+|\s+$/gm, '');
            resultObj.reply_cnt = $('span[name="replycnt"]').text();
        } else {
            resultObj.author = ""
            resultObj.read_cnt = ""
            resultObj.reply_cnt = ""
        }
    }

    if (resultObj.reply_cnt == "") {
        resultObj.isAllowReply = false;
    } else {
        resultObj.isAllowReply = true;
    }
    var data2 = data.replace(/(\s*)/g, "");
    //작성자인가??
    var isWriter = util.strRight(data2, "iswriter:");
    isWriter = util.strLeft(isWriter, ",");
    if (isWriter == "true") {
        resultObj.isWriter = true;
    } else {
        resultObj.isWriter = false;
    }
    //관리자인가??
    var isAdmin = util.strRight(data2, "isadmin:");
    isAdmin = util.strLeft(isAdmin, ",");
    if (isAdmin == "true") {
        resultObj.isAdmin = true;
    } else {
        resultObj.isAdmin = false;
    }

    $("div.dwp-btn.like").each(function (index) {
        resultObj.like_cnt = $(this).parent().find("strong").text();
    });
    if (data.indexOf("like active") > -1) {
        resultObj.isLike = true;
    } else {
        resultObj.isLike = false;
    }

    var created = $("span.date[data-xlang='LC_TIME']").attr('data-xlang-code');
    resultObj.created = moment(created).utc().format("YYYYMMDDTHHmmss");
    try {
        var attachInfo = JSON.parse($('#Already_Attach').val());
        for (var attachInfoIdx = 0; attachInfoIdx < attachInfo.length; attachInfoIdx++) {
            attachInfo[attachInfoIdx]["size"] = common.formatBytes(attachInfo[attachInfoIdx]["size"], 2);
        }
        resultObj.attach = attachInfo;
    } catch (error) {
        resultObj.attach = [];
    }

    
    if(config.bodyurl){
        var url = ""
        if (qObj.boardType == "congratulate") {
            url = config.board.detailBody_congratulate;
        } else if (qObj.boardType == "board") {
            url = config.board.detailBody_freeBoard;
            url = url.replace("#freeBoardDB#", config.freeBoardDB);
        } else if (qObj.boardType == "notice") {
            url = config.board.detailBody_notice;
        }
        resultObj.body = url.replace("#unid#", qObj.unid);
    }else{
        var bodyData = await getDetailBody(config, qObj, res, req);
        resultObj.body = bodyData.body;
    }
    

    resultObj.bodyurl = config.bodyurl;


    // console.log(data);
    var form_option = util.strRight(data, "form_option : ");
    form_option = util.strLeft(form_option, " -->");
    var form_option_Arr = form_option.split(",");
    // console.log(form_option_Arr,"??????????????????");
    for (var i = 0; i < form_option_Arr.length; i++) {
        if (form_option_Arr[i].indexOf("uselike") > -1) {
            if (util.strRight(form_option_Arr[i], ":") == "1") {
                resultObj.useLike = true;
            } else {
                resultObj.useLike = false;
            }
        }
        if (form_option_Arr[i].indexOf("usereply") > -1) {
            if (util.strRight(form_option_Arr[i], ":") == "1") {
                resultObj.useReply = true;
            } else {
                resultObj.useReply = false;
            }
        }
    }
    if (qObj.boardType == "notice" || qObj.boardType == "congratulate") {
        resultObj.useLike = true;
        resultObj.useReply = true;
    }
    var data2 = data.replace(/(\s*)/g, "");
    var lnbid = util.strRight(data2, '{lnbid:"');
    lnbid = util.strLeft(lnbid, '",');
    qObj.lnbid = lnbid;
    var boardid = util.strRight(data2, 'boardid:"');
    boardid = util.strLeft(boardid, '"}');
    qObj.boardid = boardid;

    var reply = await getReply(config, qObj, res, req);
    resultObj.reply = reply;



    // formData********************************************************

    util.writeSuccess(resultObj, res);
}
//게시판 상세보기 body
async function getDetailBody(config, qObj, res, req) {
    var url = ""
    if (qObj.boardType == "congratulate") {
        url = config.host + config.board.detailBody_congratulate;
    } else if (qObj.boardType == "board") {
        url = config.host + config.board.detailBody_freeBoard;
        url = url.replace("#freeBoardDB#", config.freeBoardDB);
    } else if (qObj.boardType == "notice") {
        url = config.host + config.board.detailBody_notice;
    }
    url = url.replace("#unid#", qObj.unid);
    console.log(url);
    var data = await axios({
        method: "get",
        url: url,
        httpsAgent: agent,
        headers: {
            "Content-Type": "application/json",
            "Cookie": qObj.cookie
        }
    })
        .then((response) => {
            console.log("************ 게시판 detail Body ***********");
            // console.log(response.data);
            return response.data;
        })
        .catch((error) => {
            // throw new Error(error);
            return [];
        });

    try {
        var resultObj = {};
        var dataArr = data.split('<p>\n<table border="1" cellspacing="2" cellpadding="4">');
        var body = common.urlConverter(dataArr[0], qObj);
        resultObj.body = body;

        var attachArr = [];
        for (var dataIdx = 1; dataIdx < dataArr.length; dataIdx++) {
            var attachObj = {};
            var path = util.strRight(dataArr[dataIdx], '<a href="');
            path = util.strLeft(path, '">');
            attachObj.path = config.host + path;
            var name = util.strRight(dataArr[dataIdx], '<B>Name: </B>');
            name = util.strLeft(name, '</td>');
            attachObj.name = name;
            attachArr[dataIdx - 1] = attachObj;
        }
        resultObj.attach = attachArr;
        return resultObj;
    } catch (error) {
        resultObj.body = data;
        return resultObj;
    }

}
//댓글 데이터
async function getReply(config, qObj, res, req) {
    var url = "";
    if (qObj.boardType == "congratulate") {
        url = config.host + config.board.replyList_congratulate;
    } else if (qObj.boardType == "board") {
        url = config.host + config.board.replyList_freeBoard;
        url = url.replace("#freeBoardReplyDB#", config.freeBoardReplyDB);
    } else if (qObj.boardType == "notice") {
        url = config.host + config.board.replyList_notice;
    }
    url = url.replace("#category#", qObj.root_unid);
    console.log(url);
    var data = await axios({
        method: "get",
        url: url,
        httpsAgent: agent,
        headers: {
            "Content-Type": "application/json",
            "Cookie": qObj.cookie
        }
    })
        .then((response) => {
            console.log("************ 댓글 리스트 ***********");
            // console.log(response.data);
            return response.data;
        })
        .catch((error) => {
            // throw new Error(error);
            return [];
        });
    var resultArr = [];
    for (var dataIdx = 0; dataIdx < data.length; dataIdx++) {
        resultObj = {};
        resultObj.unid = data[dataIdx]["@unid"];
        resultObj.root_unid = data[dataIdx]["_root_unid"];
        resultObj.parent_unid = data[dataIdx]["_par_unid"];
        resultObj.my_unid = data[dataIdx]["_key_unid"];
        resultObj.level = data[dataIdx]["_doc_level"];
        resultObj.sabun = data[dataIdx]["_empno"];
        var authorArr = data[dataIdx]["_author"].split(",");
        if (qObj.language == "ko") {
            for (var authorArrIdx = 0; authorArrIdx < authorArr.length; authorArrIdx++) {
                if (authorArr[authorArrIdx].indexOf("ko:") > -1) {
                    resultObj.author = util.strRight(authorArr[authorArrIdx], "ko:");
                }
            }
        } else if (qObj.language == "en") {
            for (var authorArrIdx = 0; authorArrIdx < authorArr.length; authorArrIdx++) {
                if (authorArr[authorArrIdx].indexOf("en:") > -1) {
                    resultObj.author = util.strRight(authorArr[authorArrIdx], "en:");
                }
            }
        }
        resultObj.fullname = data[dataIdx]["_author"];
        var authorDeptArr = data[dataIdx]["_dept"].split(",");
        if (qObj.language == "ko") {
            for (var authorArrIdx = 0; authorArrIdx < authorDeptArr.length; authorArrIdx++) {
                if (authorDeptArr[authorArrIdx].indexOf("ko:") > -1) {
                    resultObj.authorDept = util.strRight(authorDeptArr[authorArrIdx], "ko:");
                }
            }
        } else if (qObj.language == "en") {
            for (var authorArrIdx = 0; authorArrIdx < authorDeptArr.length; authorArrIdx++) {
                if (authorDeptArr[authorArrIdx].indexOf("en:") > -1) {
                    resultObj.authorDept = util.strRight(authorDeptArr[authorArrIdx], "en:");
                }
            }
        }
        var authorGradeArr = data[dataIdx]["_grade"].split(",");
        if (qObj.language == "ko") {
            for (var authorArrIdx = 0; authorArrIdx < authorGradeArr.length; authorArrIdx++) {
                if (authorGradeArr[authorArrIdx].indexOf("ko:") > -1) {
                    resultObj.authorGrade = util.strRight(authorGradeArr[authorArrIdx], "ko:");
                }
            }
        } else if (qObj.language == "en") {
            for (var authorArrIdx = 0; authorArrIdx < authorGradeArr.length; authorArrIdx++) {
                if (authorGradeArr[authorArrIdx].indexOf("en:") > -1) {
                    resultObj.authorGrade = util.strRight(authorGradeArr[authorArrIdx], "en:");
                }
            }
        }

        resultObj.created = moment(data[dataIdx]["_created"]).utc().format("YYYYMMDDTHHmmss");
        resultObj.body = data[dataIdx]["_reply_body"];
        resultArr[dataIdx] = resultObj;
    }

    // console.log(resultArr);
    ////////////////////////////
    // var tree = [],
    //     c = {};
    // var item, id, parent;

    // for (var i = 0; i < resultArr.length; i++) {
    //     // var item = {};
    //     // item.name = data[i].nodetitle.ko;
    //     id = resultArr[i].my_unid;
    //     parent = resultArr[i].parent_unid;

    //     c[id] = c[id] || [];
    //     resultArr[i]['children'] = c[id];
    //     if (parent != "") {
    //         c[parent] = c[parent] || [];

    //         c[parent].push(resultArr[i]);

    //     } else {
    //         // console.log("else",item)
    //         tree.push(resultArr[i]);
    //     }
    //     // console.log(c)
    // };
    // console.log(tree, "트리 입니당");
    return resultArr;
}
//댓글 작성, 수정
async function writeReply(config, qObj, res, req) {
    //console.log(qObj);
    // var formdata = new FormData();
    const formdata = new URLSearchParams();

    formdata.append("actiontype", "save_rep");
    formdata.append("root_unid", qObj.root_unid);
    formdata.append("par_unid", qObj.parent_unid);
    formdata.append("key_unid", qObj.my_unid);       //편집 할 때만 
    formdata.append("doc_level", qObj.level);
    formdata.append("reply_body", qObj.body);
    formdata.append("par_authorname", qObj.parentName);
    formdata.append("r_unid", qObj.unid);
    formdata.append("r_ip", "");
    formdata.append("is_pc", 1);

    var url = "";
    if (qObj.boardType == "congratulate") {
        url = config.host + config.board.reply_congratulate
        formdata.append("pardb_path", "/dwp/com/share/comm/famevent.nsf");
    } else if (qObj.boardType == "board") {
        url = config.host + config.board.reply_freeBoard
        url = url.replace("#freeBoardReplyDB#", config.freeBoardReplyDB);
        formdata.append("pardb_path", `/dwp/com/bbs/${config.freeBoardDB}`);
    } else if (qObj.boardType == "notice") {
        url = config.host + config.board.reply_notice
        formdata.append("pardb_path", "/dwp/com/share/notice/notice01.nsf");
    }

    console.log(formdata, "DDDDDDDDDDDDDDDDDDDDDDDDDD");
    console.log(url);
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
            console.log("***************  댓글작성 *****************", response.status);
            // console.log(response);
            util.writeSuccess(response.data, res);
            return;
        })
        .catch((error) => {
            throw new Error(error);
        });
}
//댓글 삭제
function deleteReply(config, qObj, res, req) {
    //console.log(qObj);
    // var formdata = new FormData();
    const formdata = new URLSearchParams();

    formdata.append("actiontype", "del_rep_sys");
    formdata.append("root_unid", qObj.body.root_unid);
    formdata.append("key_unid", qObj.body.my_unid);

    var url = "";
    if (qObj.body.boardType == "congratulate") {
        url = config.host + config.board.reply_congratulate
        formdata.append("pardb_path", "/dwp/com/share/comm/famevent.nsf");
    } else if (qObj.body.boardType == "board") {
        url = config.host + config.board.reply_freeBoard
        url = url.replace("#freeBoardReplyDB#", config.freeBoardReplyDB);
        formdata.append("pardb_path", `/dwp/com/bbs/${config.freeBoardDB}`);
    } else if (qObj.body.boardType == "notice") {
        url = config.host + config.board.reply_notice
        formdata.append("pardb_path", "/dwp/com/share/notice/notice01.nsf");
    }

    console.log(formdata, "DDDDDDDDDDDDDDDDDDDDDDDDDD");
    console.log(url);
    axios({
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
            console.log("***************  댓글삭제 *****************", response.status);
            // console.log(response);
            util.writeSuccess('Done', res);
            return;
        })
        .catch((error) => {
            throw new Error(error);
        });
}
//게시판 좋아요
function likeIt(config, qObj, res, req) {
    console.log(qObj);
    // var formdata = new FormData();
    const formdata = new URLSearchParams();

    formdata.append("actiontype", "likeit");
    formdata.append("root_unid", qObj.root_unid);

    var url = "";
    if (qObj.boardType == "congratulate") {
        url = config.host + config.board.reply_congratulate
        formdata.append("pardb_path", "/dwp/com/share/comm/famevent.nsf");
    } else if (qObj.boardType == "board") {
        url = config.host + config.board.reply_freeBoard
        url = url.replace("#freeBoardReplyDB#", config.freeBoardReplyDB);
        formdata.append("pardb_path", `/dwp/com/bbs/${config.freeBoardDB}`);
    } else if (qObj.boardType == "notice") {
        url = config.host + config.board.reply_notice
        formdata.append("pardb_path", "/dwp/com/share/notice/notice01.nsf");
    }

    //console.log(formdata, "DDDDDDDDDDDDDDDDDDDDDDDDDD");
    console.log(url);
    axios({
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
            console.log("***************  게시판 좋아요 *****************");
            util.writeSuccess(response.data, res);
            return;
        })
        .catch((error) => {
            throw new Error(error);
        });
}
//게시물 삭제
function deletedItem(config, qObj, res, req) {
    //console.log(qObj);
    // var formdata = new FormData();
    const formdata = new URLSearchParams();

    var url = "";
    if (qObj.body.boardType == "congratulate") {
        url = config.host + config.board.delete_congratulate
        formdata.append("actiontype", "del_temp");
    } else if (qObj.body.boardType == "board") {
        url = config.host + config.board.delete_freeBoard
        url = url.replace("#freeBoardDB#", config.freeBoardDB);
        url = url.replace("#freeBoardDB#", config.freeBoardDB);
        formdata.append("actiontype", "del_temp");
    } else if (qObj.body.boardType == "notice") {
        url = config.host + config.board.delete_notice
        formdata.append("actiontype", "del_temp");
    }
    formdata.append("postdata", qObj.body.unid);  // 여러개 일때 ; 구분자

    //console.log(formdata, "DDDDDDDDDDDDDDDDDDDDDDDDDD");
    console.log(url);
    axios({
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
            console.log("***************  게시물 삭제 *****************");
            // console.log(response.data);
            util.writeSuccess('Done', res);
            return;
        })
        .catch((error) => {
            throw new Error(error);
        });
}
async function sortDate(a, b) {
    // return a["created"] - b["created"];
    return b["created"] - a["created"];
}
//수정시 필드 가져오기
async function getEditField(config, qObj, res, req) {
    var url = config.host + config.board.getEditField;
    url = url.replace("#unid#", qObj.unid);
    console.log(url);
    var data = await axios({
        method: "get",
        url: url,
        httpsAgent: agent,
        headers: {
            "Content-Type": "application/json",
            "Cookie": qObj.cookie
        }
    })
        .then((response) => {
            console.log("************ 게시판 detail ***********");
            //console.log(response.data);
            return response.data;
        })
        .catch((error) => {
            // throw new Error(error);
            return [];
        });
    // console.log(data);
    const $ = cheerio.load(data);
    var formDataObj = {};
    $("input").each(function () {
        formDataObj[$(this).attr("name")] = $(this).val();
    });
    util.writeSuccess(formDataObj, res);
}
//게시판 검색
async function getBoardSearch(qObj, res, req, url) {
    // (([boardid]=bbs0002)) and (개선)
    var search = "";

    switch (qObj.searchType) {
        case "0": search = `${qObj.search}${qObj.searchword})`; break; //전체
        case "1": search = `${qObj.search}[AuthorName] contains ${qObj.searchword})`; break; //작성자
        case "2": search = `${qObj.search}[AuthorOrgName] contains ${qObj.searchword})`; break; //작성부서
        case "3": search = `${qObj.search}[Subject] contains *${qObj.searchword}*)`; break; //제목
        case "4": search = `${qObj.search}[Subject] contains *${qObj.searchword}*) or ([Body] contains *${qObj.searchword}*)`; break; //제목+본문
    }
    url = url.replace(/#search#/, search);

    url = encodeURI(url);
    console.log(url);
    var data = await axios({
        method: "get",
        url: url,
        httpsAgent: agent,
        headers: {
            "Content-Type": "application/json",
            "Cookie": qObj.cookie
        }
    })
        .then((response) => {
            console.log("************ 게시판 검색 list ***********");
            return response.data;
        })
        .catch((error) => {
            console.log(error);
            // throw new Error(error);
            return [];
        });
    // console.log(data);
    var resultArr = [];
    for (var dataIdx = 0; dataIdx < data.length; dataIdx++) {
        var resultObj = {};
        resultObj.unid = data[dataIdx]["@unid"];
        resultObj.subject = data[dataIdx]["_subject"];
        // resultObj.author =
        var authorArr = data[dataIdx]["_author"].split(",");
        for (var authorIdx = 0; authorIdx < authorArr.length; authorIdx++) {
            if (qObj.language == "ko") {
                if (authorArr[authorIdx].indexOf("ko") > -1) {
                    resultObj.author = util.strRight(authorArr[authorIdx], "ko:");
                }
            } else if (qObj.language == "en") {
                if (authorArr[authorIdx].indexOf("en") > -1) {
                    resultObj.author = util.strRight(authorArr[authorIdx], "en:");
                }
            }
        }
        resultObj.created = moment(data[dataIdx]["_created"]).utc().format("YYYYMMDDTHHmmss");

        if (data[dataIdx]["_attach"] == "true") {
            resultObj.attach = true;
        } else if (data[dataIdx]["_attach"] == "false") {
            resultObj.attach = false;
        }
        if (qObj.boardType === "notice") {
            // resultObj.category = "공지";
        } else {
            resultObj.category = data[dataIdx]["_category1"];
        }
        resultObj.readcnt = data[dataIdx]["_readcnt"];
        resultObj.likecnt = data[dataIdx]["_likecnt"];
        resultArr[dataIdx] = resultObj;
    }
    util.writeSuccess(resultArr, res);
}
async function detailFormOption(config, qObj, res, req) {
    var unrl = config.host + cofig.board.detailFormOption
    var data = await axios({
        method: "get",
        url: url,
        httpsAgent: agent,
        headers: {
            "Content-Type": "application/json",
            "Cookie": qObj.cookie
        }
    })
        .then((response) => {
            console.log("************ 게시판 검색 list ***********");
            return response.data;
        })
        .catch((error) => {
            console.log(error);
            // throw new Error(error);
            return [];
        });
}
async function firstFreeBoard(config, qObj, res, req) {

    var url = config.host + config.navigation.lnb_free.replace(/#category#/, qObj.lnbid);
    console.log(url, " sssssssssssssssssssssssssssssssssssssssss");
    var data = await axios({
        method: "get",
        url: url,
        httpsAgent: agent,
        headers: {
            "Content-Type": "application/json",
            "Cookie": qObj.cookie
        }
    }).then((response) => {
        console.log("************ 네비게이션 ***********");
        return response.data;
    }).catch((error) => {
        // throw new Error(error);
        return [];
    });

    var firstFreeBoardLNB = ""
    for (var dataIdx = 0; dataIdx < data.length; dataIdx++) {
        if (data[dataIdx]["_level"] !== 1) {
            firstFreeBoardLNB = data[dataIdx]["_lnbid"];
            break;
        }
    }
    return firstFreeBoardLNB;
}
async function getBoardSet(config, qObj, res, req) {
    if (qObj.category == "congratulate") {
        var resultObj = {};
        //"congratulate", "condolences"
        resultObj.categoryall = {
            "congratulate": {
                "categoryall_nm": "경사",
                "categoryall_val": "경사"
            }

            ,
            "condolences": {
                "categoryall_nm": "조사",
                "categoryall_val": "조사"
            }
        };
        resultObj.categoryall_nm = ["경사", "조사"];
        resultObj.categoryall_val = ["경사", "조사"];
        resultObj.isUseTerm = false;
        resultObj.isUseReply = true;
        resultObj.isUseImportance = false;
        resultObj.isUseTopFix = false;
        util.writeSuccess(resultObj, res);
    } else if (qObj.category == "notice") {
        var resultObj = {};
        resultObj.categoryall = {};
        resultObj.categoryall_nm = [];
        resultObj.categoryall_val = [];
        resultObj.isUseTerm = true;
        resultObj.isUseReply = true;
        resultObj.isUseImportance = false;
        resultObj.isUseTopFix = true;
        util.writeSuccess(resultObj, res);
    } else {
        var findUnidUrl = config.host + config.board.getBoardUnid;
        findUnidUrl = findUnidUrl.replace("#freeBoardLnb#", config.freeBoardLnb);

        var findData = await axios({
            method: "get",
            url: findUnidUrl,
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
        // console.log(findData);
        var unid = "";
        for (var i = 0; i < findData.length; i++) {
            if (qObj.lnbid == findData[i]["_boardid"]) {
                unid = findData[i]["@unid"];
            }
        }


        var url = config.host + config.board.getBoardSet;
        url = url.replace(/#unid#/g, unid);
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
        const $ = cheerio.load(data);
        data = data.replace(/(\s*)/g, "");
        // console.log(data);
        var resultObj = {};
        var categoryall, categoryall_nm = "";
        //분류관리
        try {
            var categoryallre = [];
            categoryall = util.strRight(data, `category:"`);
            categoryall = util.strLeft(categoryall, `",`);

            resultObj.categoryall = categoryall.split(";");

            categoryall_nm = util.strRight(data, `category_nm:"`);
            categoryall_nm = util.strLeft(categoryall_nm, `",`);
            var categoryall_nmArr = common.strToArr(categoryall_nm, ";", ",");
            resultObj.categoryall_nm = categoryall_nm.split(";");
            var categoryall_val = [];
            for (var i = 0; i < categoryall_nmArr.length; i++) {
                var categoryall_valArr = categoryall_nmArr[i];
                for (var j = 0; j < categoryall_valArr.length; j++) {
                    if (categoryall_valArr[j].indexOf(qObj.language) > -1) {
                        var find = categoryall_valArr[j].split(":");
                        categoryall_val[i] = find[1];
                    }
                }
            }
            resultObj.categoryall_val = categoryall_val;

            var ddd = {};
            for (var i = 0; i < resultObj.categoryall.length; i++) {
                if (resultObj.categoryall[i] == "") {
                    ddd = {};
                    break;
                }
                ddd[resultObj.categoryall[i]] = {};
                ddd[resultObj.categoryall[i]].categoryall_nm = resultObj.categoryall_nm[i];
                ddd[resultObj.categoryall[i]].categoryall_val = resultObj.categoryall_val[i];

                // categoryallre.push(ddd);
            }
            resultObj.categoryall = ddd;

        } catch (e) {
            resultObj.categoryall = {};
        }
        //게시기한
        var isUseTerm = $('div[data-xlang-name="IsUseTerm"]').attr('data-xlang-value');
        if (isUseTerm == "1") {
            resultObj.isUseTerm = true;
        } else {
            resultObj.isUseTerm = false;
        }
        //댓글
        var isUseReply = $('div[data-xlang-name="IsUseReply"]').attr('data-xlang-value');
        if (isUseReply == "1") {
            resultObj.isUseReply = true;
        } else {
            resultObj.isUseReply = false;
        }
        //중요표시
        var isUseImportance = $('div[data-xlang-name="IsUseImportance"]').attr('data-xlang-value');
        if (isUseImportance == "1") {
            resultObj.isUseImportance = true;
        } else {
            resultObj.isUseImportance = false;
        }
        //상단고정
        var isUseTopFix = $('div[data-xlang-name="IsUseTopFix"]').attr('data-xlang-value');
        if (isUseTopFix == "1") {
            resultObj.isUseTopFix = true;
        } else {
            resultObj.isUseTopFix = false;
        }

        // var subject = $("input[name='Subject']").val()
        util.writeSuccess(resultObj, res);
    }

}

module.exports = { get, post, put, del };