const express = require("express");
var cookieParser = require('cookie-parser');
const config = require("./config/key.js");
const util = require("./lib/util.js");
const url = require("url");
const setting = require("./setting/index.js");
const axios = require("axios");
var multer = require('multer');
var upload = multer();
var bodyParser = require("body-parser");
const https = require('https');
const cors = require("cors");

const agent = new https.Agent({
    rejectUnauthorized: false
});
//npm install ltpa 필요함
String.prototype.replaceAll = function (org, dest) {
    return this.split(org).join(dest);
}

var pathList = config.pathList;
var app = express();
// app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
if (config.port) {
    port = config.port;
} else {
    console.log("환경 파일--config.json 에 port 키가 없습니다.");
}
// psearch

var whitelist = config.corsWhitelist;
if (
    typeof whitelist == undefined ||
    typeof whitelist == "undefined" ||
    whitelist == null ||
    whitelist == ""
) {
    //CORS 미설정
} else {
    //CORS 설정
    var allAllow = false;
    if (typeof whitelist == "object") {
        //특정 호출만 허용
        for (var index = 0; index < whitelist.length; index++) {
            if (whitelist[index] == "*") {
                allAllow = true;
                break;
            }
        }
    } else {
        if (whitelist == "*") {
            //모두 허용
            allAllow = true;
        }
    }
    if (allAllow) {
        app.use(cors());
    } else {
        var corsOptions = {
            origin: function (origin, callback) {
                var isWhitelisted = whitelist.indexOf(origin) !== -1;
                callback(null, isWhitelisted);
            },
            credentials: true,
        };
        app.use(cors(corsOptions));
    }
}

app.get(pathList, (req, res) => {
    // console.log("여기안들어옴?", req.url);
    console.log(util.getTimeStamp() + " " + "GET..." + req.url);
    var reqUrl = url.parse(req.url, true);
    var qObj = reqUrl.query; // 일반적인 사용
    // console.log(reqUrl);

    var functionName = "";
    for (var index = 0; index < pathList.length; index++) {
        if (
            req.url
                .toLocaleLowerCase()
                .indexOf(pathList[index].toLocaleLowerCase()) == 0
        ) {
            var nIndex;
            var str = pathList[index];
            nIndex = str.indexOf("/");
            // console.log("nIndex", nIndex);
            if (nIndex != -1) {
                functionName = util.strRightBack(str, "/");
                // eval(functionName)
                console.log("./task/" + functionName + ".js" + "hihiGET");

            }
            break;
        }
    }

    // console.log(req.headers.cookie, functionName, qObj, "req.headers.cookie")
    if (functionName.length > 0) {
        const service = require("./task/" + functionName + ".js");
        qObj.functionName = functionName;

        qObj.cookie = "";
        if (req.headers.cookie) {
            qObj.cookie = req.headers.cookie;
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
        if (functionName === "login" || functionName === "languages") {
            service.get(config, qObj, res, req);
            return;
        } else {
            getReaders(qObj.cookie).then(readers => {
                qObj.readers = readers;
                getuser(qObj.cookie).then(result => {
                    if (functionName != "push") {
                        qObj.uid = result.data;
                    }
                    console.log(qObj);
                    service.get(config, qObj, res, req);
                })
            });
        }
    }



});
// pupdate
app.post(pathList, upload.array('attach'), (req, res) => {
    // console.log("아예못찾아?")
    var qObj = {};
    // console.log(req);
    //chunk : postdata
    // console.log("?????", req.body);
    qObj.type = util.strRight(req.url, '?type=');
    // console.log("====================POST===================");
    if (req.body === undefined || req.body.length === 0) {
        qObj = {};
    } else if (qObj.type == "mailsend" || qObj.type == "draftSave" || qObj.type == "autoSave" || qObj.type == "write"
        || qObj.type == "write_congratulate" || qObj.type == "write_board" || qObj.type == "write_news" || qObj.type == "write_notice"
        || qObj.type == "editItem_congratulate" || qObj.type == "editItem_board" || qObj.type == "editItem_news" || qObj.type == "editItem_notice" || qObj.type == "edit"
        || qObj.type == "agreeNreject" || qObj.type == "draft_edit" || qObj.type == "editItem" || qObj.type == "update") {
        qObj.formdata = req.body;
        qObj.file = req.files;
        // console.log(req.files, "filefilefilefilefilefile");
    } else {
        // console.log("@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@", req.body);
        qObj = req.body;
    }
    console.log(util.getTimeStamp() + " " + "POST..." + req.url);

    var functionName = "";
    for (var index = 0; index < pathList.length; index++) {
        if (
            req.url
                .toLocaleLowerCase()
                .indexOf(pathList[index].toLocaleLowerCase()) == 0
        ) {
            var nIndex;
            var str = pathList[index];
            nIndex = str.indexOf("/");
            // console.log("nIndex", nIndex);
            if (nIndex != -1) {
                functionName = util.strRightBack(str, "/");
                // eval(functionName)
                console.log("./task/" + functionName + ".js" + "hihi");

            }
            break;
        }
    }

    if (functionName.length > 0) {
        const service = require("./task/" + functionName + ".js");
        qObj.functionName = functionName;
        qObj.type = util.strRight(req.url, '?type=');

        qObj.cookie = "";
        if (req.headers.cookie) {
            qObj.cookie = req.headers.cookie;
        }
        if (functionName === "login") {
            service.post(config, qObj, res, req);
            return;
        } else {
            getReaders(qObj.cookie).then(readers => {
                qObj.readers = readers;
                getuser(qObj.cookie).then(result => {
                    if (functionName === "push") {
                        var reqUrl = url.parse(req.url, true);
                        qObj = req.body; // 일반적인 사용
                    } else {
                        qObj.uid = result.data;
                    }
                    console.log(qObj);
                    service.post(config, qObj, res, req);
                })
            });
        }
    }

});

app.put(pathList, (req, res) => {
    var body = [];
    var qObj = {};
    // console.log("hi",req.body)
    // req.on("error", function (err) {
    // console.log("[REQUEST_BODY-ERROR] " + err);
    // })
    // .on("data", function (chunk) {
    // //chunk : postdata
    // body.push(chunk);
    // })
    // .on("end", function (chunk) {

    // console.log("=======================================");
    // var postData = body;
    // if (postData === undefined || postData.length === 0) {
    // qObj = {};
    // } else {
    // qObj = JSON.parse(postData);
    // }
    qObj = req.body;
    // console.log("여기안오냐", qObj)

    console.log(util.getTimeStamp() + " " + "PUT..." + req.url);

    // convertCookie().then(cookie => {
    qObj.cookie = req.headers.cookie;

    getReaders(qObj.cookie).then(readers => {
        // console.log("***************", readers);
        qObj.readers = readers;
    });
    getuser(qObj.cookie).then((result) => {
        qObj.uid = result.data;
        // console.log(req.headers.cookie, "cookie");
        // console.log(req.headers, "req.headers");

        var reqUrl = url.parse(req.url, true);
        // console.log(reqUrl);

        var functionName = "";
        for (var index = 0; index < pathList.length; index++) {
            if (
                req.url
                    .toLocaleLowerCase()
                    .indexOf(pathList[index].toLocaleLowerCase()) == 0
            ) {
                var nIndex;
                var str = pathList[index];
                nIndex = str.indexOf("/");
                // console.log("nIndex", nIndex);
                if (nIndex != -1) {
                    functionName = util.strRightBack(str, "/");

                    // console.log(functionName, "functionname");

                    const service = require("./task/" +
                        functionName +
                        ".js");
                    qObj.functionName = functionName;
                    service.put(config, qObj, res, req);
                }
                break;
            }
        }
    });
    // })

    // });
});

app.delete(pathList, (req, res) => {
    // console.log("여기안들어옴?", req.url);
    // console.log("바디바디?", req);
    console.log(util.getTimeStamp() + " " + "GET..." + req.url);
    var reqUrl = url.parse(req.url, true);
    var qObj = reqUrl.query; // 일반적인 사용
    // console.log(req);
    qObj.body = req.body;
    // convertCookie(req.headers.cookie).then(cookie => {
    var functionName = "";
    for (var index = 0; index < pathList.length; index++) {
        if (
            req.url
                .toLocaleLowerCase()
                .indexOf(pathList[index].toLocaleLowerCase()) == 0
        ) {
            var nIndex;
            var str = pathList[index];
            nIndex = str.indexOf("/");
            // console.log("nIndex", nIndex);
            if (nIndex != -1) {
                functionName = util.strRightBack(str, "/");
                // eval(functionName)
                console.log(functionName + "hihi");
                // console.log(result.cookie, "hihi");
                console.log(qObj);
            }
            break;
        }
    }

    // qObj.cookie = req.headers.cookie;
    if (functionName.length > 0) {
        const service = require("./task/" + functionName + ".js");
        qObj.functionName = functionName;

        qObj.cookie = "";
        if (req.headers.cookie) {
            qObj.cookie = req.headers.cookie;
        }
        if (functionName === "login") {
            service.del(config, qObj, res, req);
            return;
        } else {
            getReaders(qObj.cookie).then(readers => {
                qObj.readers = readers;
                getuser(qObj.cookie).then(result => {
                    qObj.uid = result.data;
                    service.del(config, qObj, res, req);
                })
            });
        }

    }


});

async function convertCookie(cookie) {
    // console.log(cookie,"****************************************************")
    const recookie = cookie.replaceAll(" ", "");
    var arrCookie = recookie.split(";");
    var deltpa = "";
    for (var i = 0; i < arrCookie.length; i++) {
        if (arrCookie[i].indexOf("LtpaToken=") !== -1) {
            deltpa = arrCookie[i].substring(arrCookie[i].indexOf("=") + 1);
        }
    }
    return cookie.replace(deltpa, unescape(deltpa));
}

async function getuser(cookie) {
    var url = `${config.host_webserver + config.getUser}`;
    // console.log(cookie);
    // console.log(url);
    if (process.env.NODE_ENV === 'development') {
        // qObj.uid = '1';
        // console.log("여기들어오냐");
        return '1';
    } else {
        var result = {};
        // console.log(cookie, "%%%%%%%%%%%%cookie")
        result = await axios({
            method: 'get',
            url: url,
            httpsAgent: agent,
            headers: {
                "Cookie": cookie,
                'Content-Type': 'application/json'
            }
        })
            .then((response) => {
                //console.log(response.data, "도미노!!!!!!!");
                if (response.status === 200) {
                    console.log("-----------------------**************************************************** 여기 들옴?")
                    if (response.data.uid !== undefined) {

                        result.data = response.data.uid;
                        result.success = true;

                        // console.log("cookie 안날라감", result);

                        return result;

                    }
                    // else {
                    // result.success = false;
                    // console.log("cookie 날라감");
                    // return result;
                    // }


                }
                // else {
                // result.success = false;
                // console.log("cookie 날라감");
                // return result;

                // }
            }).catch(error => {
                //throw new Error(error);
                console.log("디벨로먼트용")
                console.log(error, "cookie 날라감");
                result.success = false;
                return result;
            });

        // if (!result.success) {
        // console.log("cookie 날라감");

        // let ltpa = require("ltpa");
        // var obj = {};
        // var domain = config.domino.domain;
        // obj[domain] = config.domino.ltpa_dominosecret;
        // // console.log(obj);
        // ltpa.setSecrets(obj);
        // let userNameBuf = ltpa.generateUserNameBuf(config.domino.webadminid);
        // let backendToken = ltpa.generate(userNameBuf, domain);
        // var ltpatoken = {};
        // ltpatoken["ltpatoken"] = backendToken;
        // // console.log(ltpatoken, "ltpatoken");
        // // ltpa = "LtpaToken=" + backendToken + "; DWP_LANG=ko; language=ko";
        // ltpa = "LtpaToken=" + backendToken; // 로그인 페이지 완성될시 제거 ***********************
        // // console.log(ltpa, "ltpa");


        // re = await getuid(ltpa).then((uid) => {
        // if (uid !== undefined) {
        // result.success = true;
        // result.data = uid;
        // result.cookie = ltpa + "; DWP_LANG=ko; language=ko;";
        // // result.cookie = ltpa + "; DWP_LANG=ko; language=ko; "+shimmerS+";";
        // }
        // // console.log(uid);
        // return result;

        // })
        // //console.log(re, "result4");
        // return re;


        // }
        //console.log("result.cookie@@@@@@@@@@@@@@@@@@@@@@@@@@", result);
        //console.log(result, "result5");
        // result.cookie = cookie;
        // result.cookie = cookie + "; DWP_LANG=ko; language=ko; "; // 로그인 페이지 완성될시 제거 ***********************
        return result;
    }
}

async function getuid(cookie) {
    var url = `${config.host_webserver + config.getUser}`;
    result = "";
    // console.log(url,cookie);
    // cookie = `${cookie}LoginID=.; SessionID=49DFFD5251D9577BC55DC8F3972DA4167DD1BBFD;`
    result = await axios({
        method: 'get',
        url: url,
        httpsAgent: agent,
        headers: {
            "Cookie": cookie,
            'Content-Type': 'application/json'
        }
    })
        .then((response) => {

            result = response.data.uid;

            // console.log(result,"리절트다");

            return result;

        })
    return result;
}

async function getReaders(cookie) {
    var url = `${config.host_webserver + config.getReaders}`;
    result = "";
    var unauthor = false;
    // console.log(url,"sssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssss");
    result = await axios({
        method: 'get',
        url: url,
        httpsAgent: agent,
        headers: {
            "Cookie": cookie,
            'Content-Type': 'application/json'
        }
    }).then((response) => {
        result = response.data.readers;
        if (result == undefined || result == 'undefined' || result == null || result == '') {
            unauthor = true;
        }
        return result;

    }).catch((err) => {
        unauthor = true;

    })

    // if (unauthor) {

    // let ltpa = require("ltpa");
    // var obj = {};
    // var domain = config.domino.domain;
    // obj[domain] = config.domino.ltpa_dominosecret;
    // //console.log(obj);
    // ltpa.setSecrets(obj);
    // let userNameBuf = ltpa.generateUserNameBuf(config.domino.webadminid);
    // let backendToken = ltpa.generate(userNameBuf, domain);
    // var ltpatoken = {};
    // ltpatoken["ltpatoken"] = backendToken;
    // //console.log(ltpatoken, "ltpatoken");
    // ltpa = "LtpaToken=" + backendToken;
    // if (typeof (cookie) == undefined || typeof (cookie) == "undefined" || cookie == null || cookie == "") {
    // cookie = ltpa;
    // } else {
    // cookie += "; " + ltpa;
    // }
    // //console.log("************cookie**********", cookie);

    // re = await getreader(ltpa).then((reader) => {
    // if (reader !== undefined) {
    // return reader;
    // }
    // })
    // return re;

    // }
    return result;
}

async function getreader(cookie) {
    var url = `${config.host_webserver + config.getReaders}`;
    result = "";
    result = await axios({
        method: 'get',
        url: url,
        httpsAgent: agent,
        headers: {
            "Cookie": cookie,
            'Content-Type': 'application/json'
        }
    }).then((response) => {
        result = response.data.readers;
        return result;

    })
    return result;
}

function psearch(config, qObj, res, req) {
    setting.psearch(config, qObj, res, req);
}
function pupdate(config, qObj, res, req) {
    setting.pupdate(config, qObj, res, req);
}

var server = app.listen(port, function () {
    console.log("Express server has started on port " + port);
})