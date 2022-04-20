const util = require("../lib/util.js");
const axios = require("axios");
const parse = require('node-html-parser');
var FormData = require('form-data');
const requests = require("request");
const common = require("../lib/common.js");

const https = require('https');

const agent = new https.Agent({
    rejectUnauthorized: false
});

String.prototype.replaceAll = function (org, dest) {
    return this.split(org).join(dest);
}

const get = async (config, qObj, res, req) => {
    if (config.customVersion.toLowerCase().indexOf("swg6") != 0) {
        //비표준, 사이트 수정이 필요한 경우 '/task/customise/...js' 를 수정 하십시오
        var functionName = qObj.functionName;
        const site = require("./customize/" + functionName + ".js");
        site.get(config, qObj, res, req); //사이트 커스터마이즈인 경우 별도함수 호출하고 종료
        return;
    }
    // if(qObj.type == 'Authority'){
    // 
    Authority(config, qObj, res, req);
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
    //승인
    // 
    // if (qObj.type == "login") {
    login(config, qObj, res, req);
    // }
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
    logout(config, qObj, res, req);
};

function logout(config, qObj, res, req) {
    const url = config.elastic_address.v7 + `/user_interface/_delete_by_query`;
    var query = `{
        "query": {
          "match": {
            "_id": ${qObj.body.deviceId}
          }
        }
      }`;



    const id = config.elastic_id + ":" + config.elastic_pw;
    var authorization = Buffer.from(id, "utf8").toString("base64");
    return axios({
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


            const result = response.data.deleted;
            if (result === 1) {

                util.writeSuccess({ success: true, message: "로그아웃" }, res);
                return;
            } else {
                util.writeSuccess({ success: false, message: "로그아웃 실패" }, res);

                return;
            }
        })
        .catch((error) => {
            util.writeSuccess({ success: false, message: "로그아웃 , error = > " + error }, res);

            return;

            // throw new Error(error);
        });
}

function Authority(config, qObj, res, req) {

    if (qObj.cookie.length == 0) {

        util.writeSuccess({ UserName: "Anonymous" }, res);
        return;
    } else {

        return axios({
            method: "get",
            url: config.host + "/dwp/com/sys/webservice.nsf/wPgAuthority",
            httpsAgent: agent,
            headers: {
                Cookie: qObj.cookie,
                "Content-Type": "application/json",
            },
        })
            .then(response => {

                util.writeSuccess(response.data, res);
                return;

            })

    }
}

// ltpa 추출
async function login(config, qObj, res, req) {
    try {
        requests.post({
            url: config.host + "/names.nsf?Login",
            // agent,
            body: "username=" + qObj.Username + "&password=" + qObj.Password + "&language=" + qObj.language
        }, function (error, response, body) {
            console.log(response)
            // 
            if (response && response.headers["set-cookie"]) {
                var setCookie = "";
                var cookies = response.headers["set-cookie"];

                qObj.cookies = cookies;
                

                for (var i = 0; i < cookies.length; i++) {
                    setCookie += cookies[i];
                }
                setCookie = setCookie.replaceAll(" ", "");
                arrCookie = setCookie.split(";");
                var cookies = {};
                for (var i = 0; i < arrCookie.length; i++) {
                    if (arrCookie[i].indexOf("LtpaToken=") !== -1) {
                        setCookie = arrCookie[i].substring(arrCookie[i].indexOf("=") + 1);
                        cookies.LtpaToken = setCookie;
                        qObj.cookie = `LtpaToken=${setCookie};`;
                    }
                }
                cookies.language = qObj.data.strLocale.toLowerCase();
                qObj.cookie+=`language=${qObj.data.strLocale.toLowerCase()}`

                if (!qObj.data||!qObj.data.deviceId) {
                    var result = { success: true, data: {}, cookies:cookies };
                    util.writeSuccess(result, res);
                    return;

                }else{
                    qObj.LtpaToken = setCookie;
                    isInterface(config, qObj, res, req)
                        .then((interfaceRes) => {
    
                            if (interfaceRes.success) {
                                interfaceRes.cookies = cookies;
                            }
                            util.writeSuccess(interfaceRes, res);
    
    
                        });

                }
            } else {
                // 로그인 실패
                util.writeSuccess({ success: false, message: "id, password 확인", alert: true }, res);
            }
        })
    } catch (error) {

        // 로그인 실패
        util.writeSuccess({ success: false, message: "id, password 실패 = > errormsg : " + error }, res);
    }
}

// 기기 등록됐는지 확인 (elastic)
async function isInterface(config, qObj, res, req) {
    var reader = await getReaders(config, qObj.cookies);
    var query = `{
"query":{
	"bool": {
		"must": [
			{
				"match": {
					"_id": "${qObj.data.deviceId}"
				}
			},
			{
				"match": {
					"reader": "${reader.data}"
				}
			}
		]
	}
}
}`;
    var data = await eachInterface(config, query);
    const hits = data.data.hits;

    if (data.success) {
        let cnt = hits.total.value;
        if (cnt === 0) {
            // 등록하기 전 사번을 가져오기 readers
            if (reader.success) {
                qObj.data.reader = reader.data;
                qObj.readers = reader.data;

            } else {
                return reader;
            }
            // 가져온 사번으로 같은 사번으로 변수n개 이하인지 확인
            var cntResult = await cntInterface(config, qObj, res, req);
            if (!cntResult.success) {
                return cntResult;
            }
            // 기기 등록 해야함
            data = await interfaceRegister(config, qObj, res, req);


            if (!data.success) {
                return data;
            }
        } else if (cnt > 0) {
            const state = hits.hits[0]['_source'].state;
            if (!state) {
                return { success: false, message: "분실등록된 기기", alert: true };

            }

        }
    }
    return data;
}

// reader당 몇개의 기기가 등록 됐는가
async function cntInterface(config, qObj, res, req) {
    var query = `{
"query":{
"match":{
"reader": "${qObj.data.reader}"
}
}
}`;
    const data = await eachInterface(config, query);
    if (data.success) {
        // config.registerInterfaceLimitCnt = 6;
        let cnt = data.data.hits.total.value;
        if (cnt < config.registerInterfaceLimitCnt) {
            return data;
        } else {
            return { success: false, message: "등록 기기 6개 이상", alert: true };
        }
    }
    return data;
}
// 한 사원당 등록된 기기
async function eachInterface(config, query) {
    const url = config.elastic_address.v7 + `/user_interface/_search`;
    const id = config.elastic_id + ":" + config.elastic_pw;
    var authorization = Buffer.from(id, "utf8").toString("base64");
    return await axios({
        method: "get",
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
            return { success: true, data: data };

        })
        .catch((error) => {
            return { success: false, message: "기기 확인 실패 , error = >" + error };
            // throw new Error(error);
        });
}

// readers 가져오기
async function getReaders(config, cookie) {
    var url = `${config.host_webserver + config.getReaders}`;
    return result = await axios({
        method: 'get',
        url: url,
        httpsAgent: agent,
        headers: {
            "Cookie": cookie,
            'Content-Type': 'application/json'
        }
    }).then((response) => {
        var result = response.data.readers;
        if (result == undefined || result == 'undefined' || result == null || result == '') {
            return { success: false, message: "readers 가져오기 실패" };
        } else {
            return { success: true, data: result };
        }

    }).catch((error) => {
        return { success: false, message: "readers 가져오기 실패 , error = >" + error };
    })
}
// 기기 등록 (elastic)
async function interfaceRegister(config, qObj, res, req) {

    const url = config.elastic_address.v7 + `/user_interface/_doc/${qObj.data.deviceId}`;
    qObj.data.state = true;
    var elasticUserInfo = await common.getUserInfo(qObj);
    qObj.elasticUserInfo = elasticUserInfo;
    var fullOrgCodeUrl = config.host_webserver + config.getFullOrgCode;
    fullOrgCodeUrl = fullOrgCodeUrl.replace("#unid#", qObj.elasticUserInfo.unid)
    qObj.data.fullOrgCode = await axios({
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
        return response.data.FullOrgCode;
        
    })
    .catch((error) => {
        throw new Error(error);
    });
    var query = `${JSON.stringify(qObj.data)}`;

    const id = config.elastic_id + ":" + config.elastic_pw;
    var authorization = Buffer.from(id, "utf8").toString("base64");

    return await axios({
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

            const result = response.data.result;
            if (result === "created" || result == "updated") {

                return { success: true, data: response.data };
            } else {
                return { success: false, message: "기기 등록 실패" };
            }
        })
        .catch((error) => {
            return { success: false, message: "기기 등록 실패 , error = > " + error };

            // throw new Error(error);
        });
}

module.exports = { get, post, put, del };