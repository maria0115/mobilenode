const util = require("../lib/util.js");
const logger = require("../lib/log.js");
const config = require("../config/config.json");
const path = require("path");

const get = async (config, qObj, res, req) => {
    if (config.customVersion.toLowerCase().indexOf("swg6") != 0) {
        //비표준, 사이트 수정이 필요한 경우 '/task/customise/...js' 를 수정 하십시오
        var functionName = qObj.functionName;
        const site = require("./customize/" + functionName + ".js");
        site.get(config, qObj, res, req); //사이트 커스터마이즈인 경우 별도함수 호출하고 종료
        return;
    }
    console.log("오긴오나");

    var data = {};
    data.form = config.form;
    data.config = config.config;

    res.statusCode = 200;
    res.setHeader("Content-type", "application/json; charset=UTF-8");
    res.send(JSON.stringify(data));
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


module.exports = { get, post, put, del}; 