const util = require("../lib/util.js");
const logger = require("../lib/log.js");
const config = require("../config/config.json");
const path = require("path");
const axios = require("axios");
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

    var url = `${config.elastic_address[config.version]}/${config.default_index[config.version]
        }/_search`;
    var query = {
        query: {
            match: {
                _id: qObj.uid,
            },
        },
    };
    const id = config.elastic_id + ":" + config.elastic_pw;
    var authorization = Buffer.from(id, "utf8").toString("base64");
    var re = 0;


    // 저장된 데이터가 있는지 없는지
    var data = await axios({
        method: "post",
        url: url,
        httpsAgent: agent,
        data: JSON.stringify(query),
        headers: {
            Authorization: "Basic " + authorization,
            "Content-Type": "application/json",
        },
    })
        .then((response) => {
            var data = response.data;
            re = data.hits.total.value;
            if (re !== 0) {
                // 여기다가는 바로 데이터 값 돌려주기
                // res.statusCode = 200;
                // res.setHeader(
                //     "Content-type",
                //     "application/json; charset=UTF-8"
                // );
                return data.hits.hits[0]["_source"];
                // res.send(JSON.stringify(data.hits.hits[0]["_source"]));
                // return;
            }
            return undefined;

            //data 구조 변환
        })
        .catch((error) => {
            throw new Error(error);
        });
    var configData = {};
    var GnbData = await axios({
        method: "get",
        url: `http://localhost:${config.port}/api/navigation?category=`,
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
    console.log(GnbData, "GnbDataGnbDataGnbDataGnbDataGnbDataGnbDataGnbDataGnbDataGnbDataGnbData")

    if (data && re !== 0) {
        // 이미 저장된 데이터가 있으면
        var m = data.main.menuportlet;
        var p = data.main.portlet;

        var portlet = [];
        var addportlet = [];
        var menuportlet = [];
        for (var i = 0; i < GnbData.length; i++) {
            var isGnb = false;
            var ismenuGnb = false;
            for (var j = 0; j < p.length; j++) {
                if (p[j].category == GnbData[i].category && p[j].lnbid == GnbData[i].lnbid) {
                    p[j].title = GnbData[i].title;
                    portlet.push(p[j]);
                    isGnb = true;
                    break;
                }
            }
            for (var j = 0; j < m.length; j++) {
                if (m[j].category == GnbData[i].category && m[j].lnbid == GnbData[i].lnbid) {
                    m[j].title = GnbData[i].title;
                    menuportlet.push(m[j]);
                    ismenuGnb = true;
                    break;
                }
            }
            if (!isGnb) {
                // 추가된 Gnb에 원래 있던 포틀릿이 없다면
                GnbData[i].service = true;
                addportlet.push(GnbData[i]);
            }
            if (!ismenuGnb) {
                // 추가된 Gnb에 원래 있던 menu포틀릿이 없다면
                GnbData[i].service = true;
                menuportlet.push(GnbData[i]);
            }


        }

        portlet.sort((a, b) => a.index - b.index);
        for (var i = 0; i < addportlet.length; i++) {
            addportlet[i].index = i + portlet.length;
            addportlet[i].order = i + portlet.length + 1;
        }
        portlet = portlet.concat(addportlet);

        data.main.portlet = portlet;
        data.main.menuportlet = menuportlet;
        configData = data;

    } else {
        var portlet = [];
        for (var i = 0; i < GnbData.length; i++) {
            portlet[i] = GnbData[i];
            portlet[i].service = true;
        }
        config.config.main.menuportlet = portlet;
        config.config.main.portlet = portlet;
        configData = config.config
    }

    // if (re === 0) {

    //     config.config.main.menuportlet= await axios({
    //         method: "get",
    //         url: `http://localhost:${config.port}/api/navigation?category=`,
    //         headers: {
    //             "Content-Type": "application/json",
    //             "Cookie": qObj.cookie
    //         },
    //     })
    //         .then((response) => {
    //             

    //             return response.data;
    //         })
    //         .catch((error) => {
    //             throw new Error(error);
    //         });

    var url = `${config.elastic_address[config.version]}/${config.default_index[config.version]
        }/_doc/${qObj.uid}`;

    await axios({
        method: "post",
        url: url,
        httpsAgent: agent,
        data: JSON.stringify(configData),
        headers: {
            Authorization: "Basic " + authorization,
            "Content-Type": "application/json",
        },
    })
        .then((response) => {
            var data = response.data;
            if (data.result === "created" || data.result === "updated") {

                res.statusCode = 200;
                res.setHeader(
                    "Content-type",
                    "application/json; charset=UTF-8"
                );
                res.send(JSON.stringify(configData));
                return;
            }

            //data 구조 변환
        })
        .catch((error) => {
            throw new Error(error);
        });
    // }
};
const post = async (config, qObj, res, req) => {
    if (config.customVersion.toLowerCase().indexOf("swg6") != 0) {
        //비표준, 사이트 수정이 필요한 경우 '/task/customise/...js' 를 수정 하십시오
        var functionName = qObj.functionName;
        const site = require("./customize/" + functionName + ".js");
        site.post(config, qObj, res, req); //사이트 커스터마이즈인 경우 별도함수 호출하고 종료
        return;
    }
    const url = `${config.elastic_address[config.version]}/${config.default_index[config.version]
        }/_update/${qObj.uid}`;
    var query = `{
        "doc":${JSON.stringify(qObj.setting)}
    }`;
    const id = config.elastic_id + ":" + config.elastic_pw;
    var authorization = Buffer.from(id, "utf8").toString("base64");



    await axios({
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
            // 
            re = data["_shards"].successful;
            if (re === 1) {
                // 여기다가는 바로 데이터 값 돌려주기
                result = { successful: true };
            } else if (re === 0) {
                result = { successful: false };
            }
            res.statusCode = 200;
            res.setHeader("Content-type", "application/json; charset=UTF-8");
            res.send(JSON.stringify(result));
            return;

            //data 구조 변환
        })
        .catch((error) => {
            throw new Error(error);
        });
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
module.exports = { get, post, put, del };