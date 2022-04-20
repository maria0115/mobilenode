const util = require("../lib/util.js");
const logger = require("../lib/log.js");
const config = require("../config/config.json");
const path = require("path");
const cookie2 = require('cookie');
const axios = require("axios");
const syncRequest = require("sync-request");
const https = require('https');

const agent = new https.Agent({
    rejectUnauthorized: false
});

/**
 *
 * @param {*} config
 * @param {*} qObj
 * @param {*} res
 * @param {*} req
 *    /api/languages?key=&language=ko|...
 */
const get = async (config, qObj, res, req) => {
    if (config.getLanguageFormat.toLowerCase().indexOf("swg6") != 0) {
        var functionName = qObj.functionName;
        const site = require("./customize/" + functionName + ".js");
        site.get(config, qObj, res, req); //사이트 커스터마이즈인 경우 별도함수 호출하고 종료
        return;
    }

    //for SWG 6.X
    //var language = qObj.language;
    var key = qObj.key;
    if (typeof key == undefined || typeof key == "undefined" || key == null) {
        key = "";
    }
    if (key == "") {
        key = "mobile";
    } else {
        key = "mobile." + key;
    }
    var arr = key.split(".");

    var searchKey = arr[0];
    if (arr.length > 1) {
        searchKey += "." + arr[1];
    }
    var cookie = qObj.cookie;

    if (
        typeof cookie == undefined ||
        typeof cookie == "undefined" ||
        cookie == null ||
        cookie == "" || qObj.key == 'common'
    ) {
        let ltpaToken = require("./ltpa.js");
        cookie = await ltpaToken.getCookie();
        //cookie += "; DWP_LANG=ko; language=ko";
    }

    // if (qObj.cookie !== undefined) {
    //     const lang = cookie2.parse(qObj.cookie);
    //     if (lang.hasOwnProperty("language")) {
    //         qObj.language = cookie2.parse(qObj.cookie).language;
    //     }
    // } else {
    //     qObj.language = "ko";
    // }

    var languageArr = qObj.cookie.split(";"); //['LtpaToken=AAECAzYwYjVlMWI1NjBiNWY5MjVwYXJraW5nN6ZpwmwB3W1vmia3XGR/k6gsexhZ',' DWP_LANG=ko',' language=ko']
    var language = "";
    for (i = 0; i < languageArr.length; i++) {
        if (languageArr[i].indexOf("language=") > -1) {
            var find = languageArr[i].split("=") //[ ' language', 'ko' ]
            language = find[1]; // ko
        }
    }
    qObj.language = language;

    var language = util.getLanguageCode(req, qObj);

    // console.log(language + "===============================================================================>" + key, config.host + config.getLanguages, cookie);
    var url = config.host + config.getLanguages;
    url = url.replace("$language$", language);
    url = url.replace("$key$", searchKey);

    // console.log(language + "==>" + key, cookie, url);
    result = await axios({
        method: "get",
        url: url,
        httpsAgent: agent,
        key: key,
        headers: {
            Cookie: cookie,
            "Content-Type": "application/json",
        },
    })
        .then((response) => {
            //console.log(response.data, "도미노!!!!!!!");
            var ret = {};
            var das = response.data;
            //console.log(das);
            for (var index = 0; index < das.length; index++) {
                var lanObj = das[index];
                var docProtocol = util.strLeft(url, "://"); //http OR https
                var docHost = util.strRight(url, "://"); //swg60.saerom.co.kr/dwp/com/abc.nsf/~ OR swg60.saerom.co.kr:8088/dwp/com/abc.nsf/~
                docHost = util.strLeft(docHost, "/"); //swg60.saerom.co.kr OR swg60.saerom.co.kr:8088
                var docUrl =
                    docProtocol + "://" + docHost + lanObj["@link"]["href"];
                var docObj = getLanguage(docUrl, cookie);
                var fieldObj = JSON.parse(docObj.getBody("utf-8"));
                //console.log(fieldObj);
                //nm_attr VS lang_word:
                var names = fieldObj.nm_attr;
                //console.log(names,"names");
                var values = fieldObj.lang_word;
                for (
                    var attrIndex = 0;
                    attrIndex < names.length;
                    attrIndex++
                ) {
                    // console.log(names[attrIndex], response.config.key);
                    var origKey = response.config.key;
                    if (names[attrIndex].indexOf(origKey) == 0) {
                        //mobie.config.login.setlogin, ....
                        var key = util.strRight(
                            names[attrIndex],
                            origKey + "."
                        ); //config.login.setlogin, .... OR login.setlogin, ....
                        //console.log(key);
                        var arrNameSpace = key.split(".");
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
                        //console.log(ns,ns.indexOf('['));
                        if (ns.indexOf('[') != -1 && ns.indexOf(']') != -1) {
                            //예를 들어 'mobile.config.display.list["10","15","30"]'
                            //values[attrIndex] <= '["10개","15개","30개"]'
                            var valArr = eval(values[attrIndex]); // ["10개","15개","30개"]
                            //console.log("*********attrIndex*********",attrIndex);
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

            util.writeSuccess(
                ret,
                res,
                "application/json; charset=utf-8"
            );
        })
        .catch((error) => {
            //throw new Error(error);
            console.log("ERROR", error, url);
            util.writeError(error, res);
        });
};
const post = async (config, qObj, res, req) => {
    if (config.customVersion.toLowerCase().indexOf("swg6") != 0) {
        //비표준, 사이트 수정이 필요한 경우 '/task/customise/...js' 를 수정 하십시오
        var functionName = qObj.functionName;
        const site = require("./customize/" + functionName + ".js");
        site.post(config, qObj, res, req); //사이트 커스터마이즈인 경우 별도함수 호출하고 종료
        return;
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
};


//다국어 추출하여 반환하는 함수
function getLanguage(documentUrl, cookie) {
    var ret = {};

    ret = syncRequest("GET", documentUrl, {
        headers: {
            encoding: "utf-8",
            Cookie: cookie,
            agent,
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


module.exports = { get, post, put, del };
