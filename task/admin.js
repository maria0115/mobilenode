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

const get = async (config, qObj, res, req) => {
    if (config.customVersion.toLowerCase().indexOf("swg6") != 0) {
        //비표준, 사이트 수정이 필요한 경우 '/task/customise/...js' 를 수정 하십시오
        var functionName = qObj.functionName;
        const site = require("./customize/" + functionName + ".js");
        site.get(config, qObj, res, req); //사이트 커스터마이즈인 경우 별도함수 호출하고 종료
        return;
    }

    var languageArr = qObj.cookie.split(";"); //['LtpaToken=AAECAzYwYjVlMWI1NjBiNWY5MjVwYXJraW5nN6ZpwmwB3W1vmia3XGR/k6gsexhZ',' DWP_LANG=ko',' language=ko']
    var language = "";
    for (i = 0; i < languageArr.length; i++) {
        if (languageArr[i].indexOf("language=") > -1) {
            var find = languageArr[i].split("=") //[ ' language', 'ko' ]
            language = find[1]; // ko
        }
    }
    qObj.language = language;

    // 모든 기기 등록정보, 분실신고 기기 등록정보
    if (qObj.type == "lostDeviceList") {
        lostDeviceList(config, qObj, res, req);
    }
    //분실 신고
    else if (qObj.type == "setTrue") {
        update(config, qObj, res, req);
    }
    //해제
    else if (qObj.type == "setFalse") {
        update(config, qObj, res, req);
    }
    //조직도 유저 정보
    else if (qObj.type == "userInfo") {
        userInfo(config, qObj, res, req);
    }
    //조직도 부서 정보
    else if (qObj.type == "deptInfo") {
        deptInfo(config, qObj, res, req);
    }
    //유저아이콘 클릭했을시 나오는 정보
    else if (qObj.type == "selectUserInfo") {
        selectUserInfo(config, qObj, res, req);
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
//등록,분실 단말기 정보
async function lostDeviceList(config, qObj, res, req) {
    var url = `${config.elastic_address[config.version]}/${config.user_push}/_search`;
    const id = config.elastic_id + ":" + config.elastic_pw;
    var authorization = Buffer.from(id, "utf8").toString("base64");
    var query;
    if (qObj.isAdmin == "false") {
        if (qObj.state == "false") {
            query = {
                "query": {
                    "bool": {
                        "filter": [
                            {
                                "bool": {
                                    "must": [
                                        { "term": { "reader": qObj.readers } },
                                        { "term": { "state": false } }
                                    ]
                                }
                            }
                        ],
                        "must": [
                            {
                                "match_all": {}
                            }
                        ]
                    }
                },
                "size": qObj.size,
                "from": qObj.size * qObj.page
            };
            if (qObj.filter == "name" || qObj.filter == "empno") {
                query = {
                    "query": {
                        "bool": {
                            "filter": [
                                {
                                    "bool": {
                                        "must": [
                                            { "term": { "reader": qObj.readers } },
                                            { "term": { "state": false } }
                                        ]
                                    }
                                }
                            ],
                            "must": [
                                {
                                    "match": {
                                        "reader.search": qObj.keyword
                                    }
                                }
                            ]
                        }
                    },
                    "size": qObj.size,
                    "from": qObj.size * qObj.page
                };
            } else if (qObj.filter == "all") {
                query = {
                    "query": {
                        "bool": {
                            "filter": [
                                {
                                    "bool": {
                                        "must": [
                                            { "term": { "reader": qObj.readers } },
                                            { "term": { "state": false } }
                                        ]
                                    }
                                }
                            ],
                            "must": [
                                {
                                    "multi_match": {
                                        "query": qObj.keyword,
                                        "fields": [
                                            "reader.search",
                                            "deviceKind.search",
                                            "deviceId.search",
                                            "deviceName.search",
                                            "osKind.search"
                                        ],
                                        "type": "phrase",
                                        "operator": "OR"

                                    }
                                }
                            ]
                        }
                    },
                    "size": qObj.size,
                    "from": qObj.size * qObj.page
                };
                if (qObj.keyword == "" || qObj.keyword == undefined) {
                    query = {
                        "query": {
                            "bool": {
                                "filter": [
                                    {
                                        "bool": {
                                            "must": [
                                                { "term": { "reader": qObj.readers } },
                                                { "term": { "state": false } }
                                            ]
                                        }
                                    }
                                ],
                                "must": [
                                    {
                                        "match_all": {}
                                    }
                                ]
                            }
                        },
                        "size": qObj.size,
                        "from": qObj.size * qObj.page
                    };
                }
            }
        } else {
            query = {
                "query": {
                    "bool": {
                        "filter": [
                            {
                                "bool": {
                                    "must": [
                                        { "term": { "reader": qObj.readers } }
                                    ]
                                }
                            }
                        ],
                        "must": [
                            {
                                "match_all": {}
                            }
                        ]
                    }
                },
                "size": qObj.size,
                "from": qObj.size * qObj.page
            };
            if (qObj.filter == "name" || qObj.filter == "empno") {
                query = {
                    "query": {
                        "bool": {
                            "filter": [
                                {
                                    "bool": {
                                        "must": [
                                            { "term": { "reader": qObj.readers } }
                                        ]
                                    }
                                }
                            ],
                            "must": [
                                {
                                    "match": {
                                        "reader.search": qObj.keyword
                                    }
                                }
                            ]
                        }
                    },
                    "size": qObj.size,
                    "from": qObj.size * qObj.page
                };
            } else if (qObj.filter == "all") {
                query = {
                    "query": {
                        "bool": {
                            "filter": [
                                {
                                    "bool": {
                                        "must": [
                                            { "term": { "reader": qObj.readers } }
                                        ]
                                    }
                                }
                            ],
                            "must": [
                                {
                                    "multi_match": {
                                        "query": qObj.keyword,
                                        "fields": [
                                            "reader.search",
                                            "deviceKind.search",
                                            "deviceId.search",
                                            "deviceName.search",
                                            "osKind.search"
                                        ],
                                        "type": "phrase",
                                        "operator": "OR"

                                    }
                                }
                            ]
                        }
                    },
                    "size": qObj.size,
                    "from": qObj.size * qObj.page
                };
                if (qObj.keyword == "" || qObj.keyword == undefined) {
                    query = {
                        "query": {
                            "bool": {
                                "filter": [
                                    {
                                        "bool": {
                                            "must": [
                                                { "term": { "reader": qObj.readers } }
                                            ]
                                        }
                                    }
                                ],
                                "must": [
                                    {
                                        "match_all": {}
                                    }
                                ]
                            }
                        },
                        "size": qObj.size,
                        "from": qObj.size * qObj.page
                    };
                }
            }
        }
    } else {
        if (qObj.state == "false") {
            query = {
                "query": {
                    "match": {
                        "state": false
                    }
                },
                "size": qObj.size,
                "from": qObj.size * qObj.page
            };
            if (qObj.filter == "name" || qObj.filter == "empno") {
                query = {
                    "query": {
                        "bool": {
                            "filter": [
                                {
                                    "term": {
                                        "state": false
                                    }
                                }
                            ],
                            "must": [
                                {
                                    "match": {
                                        "reader.search": qObj.keyword
                                    }
                                }
                            ]
                        }
                    },
                    "size": qObj.size,
                    "from": qObj.size * qObj.page
                };
            } else if (qObj.filter == "all") {
                query = {
                    "query": {
                        "bool": {
                            "filter": [
                                {
                                    "term": {
                                        "state": false
                                    }
                                }
                            ],
                            "must": [
                                {
                                    "multi_match": {
                                        "query": qObj.keyword,
                                        "fields": [
                                            "reader.search",
                                            "deviceKind.search",
                                            "deviceId.search",
                                            "deviceName.search",
                                            "osKind.search"
                                        ],
                                        "type": "phrase",
                                        "operator": "OR"

                                    }
                                }
                            ]
                        }
                    },
                    "size": qObj.size,
                    "from": qObj.size * qObj.page
                };
                if (qObj.keyword == "" || qObj.keyword == undefined) {
                    query = {
                        "query": {
                            "bool": {
                                "filter": [
                                    {
                                        "term": {
                                            "state": false
                                        }
                                    }
                                ],
                                "must": [
                                    {
                                        "match_all": {}
                                    }
                                ]
                            }
                        },
                        "size": qObj.size,
                        "from": qObj.size * qObj.page
                    };
                }
            }
        } else {
            query = {
                "query": {
                    "match_all": {}
                },
                "size": qObj.size,
                "from": qObj.size * qObj.page
            };
            if (qObj.filter == "name" || qObj.filter == "empno") {
                query = {
                    "query": {
                        "match": {
                            "reader.search": qObj.keyword
                        }
                    },
                    "size": qObj.size,
                    "from": qObj.size * qObj.page
                };
            } else if (qObj.filter == "all") {
                query = {
                    "query": {
                        "multi_match": {
                            "query": qObj.keyword,
                            "fields": [
                                "reader.search",
                                "deviceKind.search",
                                "deviceId.search",
                                "deviceName.search",
                                "osKind.search"
                            ],
                            "type": "phrase",
                            "operator": "OR"

                        }
                    },
                    "size": qObj.size,
                    "from": qObj.size * qObj.page
                };
                if (qObj.keyword == "" || qObj.keyword == undefined) {
                    query = {
                        "query": {
                            "match_all": {}
                        },
                        "size": qObj.size,
                        "from": qObj.size * qObj.page
                    };
                }
            }
        }
    }
    // console.log(JSON.stringify(query));
    var total;
    var data = await axios({
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
            var data2 = response.data;
            total = response.data["hits"]["total"]["value"];
            return data2["hits"]["hits"];

        })
        .catch((error) => {
            throw new Error(error);
        });

    var resultObj2 = {};
    var resultArr = [];
    for (var i = 0; i < data.length; i++) {
        var resultObj = {};
        resultObj.deviceId = data[i]["_source"]["deviceId"];
        if (data[i]["_source"]["osKind"] == "A") {
            resultObj.osKind = "Android";
        } else if (data[i]["_source"]["osKind"] == "I") {
            resultObj.osKind = "iPhone";
        }
        if (data[i]["_source"]["deviceKind"] == "P") {
            resultObj.deviceKind = "Phone";
        } else if (data[i]["_source"]["deviceKind"] == "T") {
            resultObj.deviceKind = "Tablet";
        }
        resultObj.deviceName = data[i]["_source"]["deviceName"];
        var userReaders = data[i]["_source"]["reader"];
        var userReadersArr = userReaders.split("/");
        for (var k = 0; k < userReadersArr.length; k++) {
            if (userReadersArr[k].indexOf("CN=") > -1) {
                var userArr = userReadersArr[k].split("=");
                resultObj.name = userArr[1];
            }
            if (userReadersArr[k].indexOf("OU=") > -1) {
                var userArr = userReadersArr[k].split("=");
                resultObj.empno = userArr[1];
            }
        }
        resultObj.state = data[i]["_source"]["state"];
        resultArr.push(resultObj);
    }
    resultObj2.data = resultArr;
    resultObj2.total = total;
    util.writeSuccess(resultObj2, res);
}
//분실 신고, 해제
async function update(config, qObj, res, req) {
    var deviceIdArr = qObj.deviceId.split(";");
    var result;
    for (var i = 0; i < deviceIdArr.length; i++) {

        var url = `${config.elastic_address[config.version]}/${config.user_push}/_update/${deviceIdArr[i]}`;
        const id = config.elastic_id + ":" + config.elastic_pw;
        var authorization = Buffer.from(id, "utf8").toString("base64");
        var query;
        var state;
        if (qObj.type == "setFalse") {
            state = false;
        } else if (qObj.type == "setTrue") {
            state = true;
        }

        query = {
            "doc": {
                "state": state
            }
        };

        result = await axios({
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
                return response.data["result"];

            })
            .catch((error) => {
                return "업데이트 할 문서 없음"
            });
    }
    util.writeSuccess(result, res);

}
//단말기 정보 삭제
async function deleteItem(config, qObj, res, req) {
    var deviceIdArr = qObj.deviceId.split(";");
    var result;
    for (var i = 0; i < deviceIdArr.length; i++) {

        var url = `${config.elastic_address[config.version]}/${config.user_push}/_doc/${deviceIdArr[i]}`;
        const id = config.elastic_id + ":" + config.elastic_pw;
        var authorization = Buffer.from(id, "utf8").toString("base64");

        result = await axios({
            method: "DELETE",
            url: url,
            httpsAgent: agent,
            headers: {
                Authorization: "Basic " + authorization,
                "Content-Type": "application/json",
            },
        })
            .then((response) => {
                return response.data["result"];
            })
            .catch((error) => {
                return "삭제 할 문서 없음";
            });

    }
    util.writeSuccess(result, res);

}
//부서안의 구성원 정보
async function userInfo(config, qObj, res, req) {
    var url = `${config.elastic_address[config.version]}/${config.elasticPersonDB}/_search`;

    const id = config.elastic_id + ":" + config.elastic_pw;
    var authorization = Buffer.from(id, "utf8").toString("base64");

    console.log(url);
    var query = {
        "query": {
            "bool": {
                "filter": [
                    {
                        "bool": {
                            "must": [
                                { "term": { "companycode": qObj.companycode } },
                                { "term": { "departmentcode": qObj.departmentcode } },
                                { "term": { "@form": "Person" } }
                            ]
                        }
                    }
                ]
            }
        },
        "size": qObj.size,
        "from": qObj.size * qObj.page,
        "sort": [
            { "sort": { "order": "asc" } }
        ]
    };
    if (qObj.filter == "name") {
        query = {
            "query": {
                "bool": {
                    "filter": [
                        {
                            "term": {
                                "@form": "Person"
                            }
                        }
                    ],
                    "must": [
                        {
                            "match": {
                                "name.ko.search": qObj.keyword
                            }
                        }
                    ]
                }
            },
            "size": qObj.size,
            "from": qObj.size * qObj.page
        };
    } else if (qObj.filter == "empno") {
        query = {
            "query": {
                "bool": {
                    "filter": [
                        {
                            "term": {
                                "@form": "Person"
                            }
                        }
                    ],
                    "must": [
                        {
                            "match": {
                                "empno.search": qObj.keyword
                            }
                        }
                    ]
                }
            },
            "size": qObj.size,
            "from": qObj.size * qObj.page
        };
    } else if (qObj.filter == "all") {
        query = {
            "query": {
                "bool": {
                    "filter": [
                        {
                            "term": { "@form": "Person" }
                        }
                    ],
                    "must": [
                        {
                            "multi_match": {
                                "query": qObj.keyword,
                                "fields": [
                                    "name.ko.search",
                                    "empno.search",
                                    "position.ko.search",
                                    "grade.ko.search",
                                    "departmentname.ko.search"
                                ],
                                "type": "phrase",
                                "operator": "OR"
                            }
                        }
                    ]
                }
            },
            "size": qObj.size,
            "from": qObj.size * qObj.page
        };
        if (qObj.keyword == "" || qObj.keyword == undefined) {
            query = {
                "query": {
                    "bool": {
                        "filter": [
                            {
                                "bool": {
                                    "must": [
                                        { "term": { "companycode": qObj.companycode } },
                                        { "term": { "departmentcode": qObj.departmentcode } },
                                        { "term": { "@form": "Person" } }
                                    ]
                                }
                            }
                        ],
                        "must": [
                            {
                                "match_all": {}
                            }
                        ]
                    }
                },
                "size": qObj.size,
                "from": qObj.size * qObj.page,
                "sort": [
                    { "sort": { "order": "asc" } }
                ]
            };
            if (qObj.companycode == qObj.departmentcode) {
                query = {
                    "query": {
                        "bool": {
                            "filter": [
                                {
                                    "bool": {
                                        "must": [
                                            { "term": { "@form": "Person" } }
                                        ]
                                    }
                                }
                            ],
                            "must": [
                                {
                                    "match_all": {}
                                }
                            ]
                        }
                    },
                    "size": qObj.size,
                    "from": qObj.size * qObj.page,
                    "sort": [
                        { "sort": { "order": "asc" } }
                    ]
                };
            }

            if (qObj.companycode == "" || qObj.companycode == undefined || qObj.departmentcode == "" || qObj.departmentcode == undefined) {
                query = {
                    "query": {
                        "bool": {
                            "filter": [
                                {
                                    "bool": {
                                        "must": [
                                            { "term": { "@form": "Person" } }
                                        ]
                                    }
                                }
                            ],
                            "must": [
                                {
                                    "match_all": {}
                                }
                            ]
                        }
                    },
                    "size": qObj.size,
                    "from": qObj.size * qObj.page,
                    "sort": [
                        { "sort": { "order": "asc" } }
                    ]
                };
            }
        }
    }
    var total;
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
            total = response.data["hits"]["total"]["value"];
            return data["hits"]["hits"];

        })
        .catch((error) => {
            throw new Error(error);
        });
    var orgArr = [];
    //퇴사자 지우기 (엘라스틱에는 퇴사자 data 남아있음)
    for (var i = 0; i < result.length; i++) {
        if (result[i]["_source"]["@retired"] === 'Y') {
            result.splice(i, 1);
            i--;
        }
    }
    for (var orgInx = 0; orgInx < result.length; orgInx++) {
        var orgObj = {};
        orgObj.id = result[orgInx]["_source"]["@id"];
        var idArr = orgObj.id.split("/");
        if (idArr.length == 3) {
            orgObj.scheduleId = orgObj.id + "@" + idArr[2];
        } else if (idArr.length == 2) {
            orgObj.scheduleId = orgObj.id + "@" + idArr[1];
        }
        orgObj.name = result[orgInx]["_source"]["name"][qObj.language] + " " + result[orgInx]["_source"]["position"][qObj.language];
        orgObj.grade = result[orgInx]["_source"]["grade"][qObj.language];
        orgObj.position = result[orgInx]["_source"]["position"][qObj.language];
        orgObj.shortname = result[orgInx]["_source"]["name"][qObj.language];
        orgObj.department = result[orgInx]["_source"]["departmentname"][qObj.language];
        orgObj.company = result[orgInx]["_source"]["companyname"][qObj.language];
        orgObj.email = result[orgInx]["_source"]["email"];
        orgObj.mobile = result[orgInx]["_source"]["mobile"];
        orgObj.office = result[orgInx]["_source"]["office"];
        orgObj.approvalInfo = result[orgInx]["_source"].approvalInfo;
        orgObj.parentcode = result[orgInx]["_source"].departmentcode;
        orgObj.companycode = result[orgInx]["_source"].companycode;
        orgObj.mycode = result[orgInx]["_source"].empno;
        // var photo = config.mail.photo;
        // photo = photo.replace(/#empno#/g, orgObj.mycode);
        var photoUrl = config.photo;
        photoUrl = photoUrl.replace(/#sabun#/g, orgObj.mycode);
        orgObj.photo = photoUrl;
        orgObj.kinds = result[orgInx]["_source"]["@form"];
        orgObj.notesId = result[orgInx]["_id"];
        //단말기 등록되어있는지 확인하기
        var isUse;
        var deviceUrl = `${config.elastic_address[config.version]}/${config.user_push}/_search`;
        var query = {
            "query": {
                "match": {
                    "reader": orgObj.notesId
                }
            }
        }
        await axios({
            method: "post",
            url: deviceUrl,
            httpsAgent: agent,
            data: query,
            headers: {
                Authorization: "Basic " + authorization,
                "Content-Type": "application/json",
            },
        })
            .then((response) => {
                isUse = response.data["hits"]["total"]["value"];
                if (isUse > 0) {
                    orgObj.isUseDevice = true;
                } else {
                    orgObj.isUseDevice = false;
                }
                return;

            })
            .catch((error) => {
                throw new Error(error);
            });

        orgArr.push(orgObj);
    }
    var resultObj2 = {};
    resultObj2.data = orgArr;
    resultObj2.total = total;
    util.writeSuccess(resultObj2, res);
}
//부서 정보
async function deptInfo(config, qObj, res, req) {
    var url = `${config.elastic_address[config.version]}/${config.elasticPersonDB}/_search`;

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
                                {"term": {"companycode": "${qObj.companycode}"}},
                                {"term": {"departmentcode": "${qObj.departmentcode}"}},
                                {"term": {"@form": "Department"}}
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
    var orgArr = [];
    // console.log(result);
    //퇴사자 지우기 (엘라스틱에는 퇴사자 data 남아있음)
    for (var i = 0; i < result.length; i++) {
        if (result[i]["_source"]["@retired"] === 'Y') {
            result.splice(i, 1);
            i--;
        }
    }
    for (var orgInx = 0; orgInx < result.length; orgInx++) {
        var orgObj = {};
        orgObj.name = result[orgInx]["_source"]["name"][qObj.language];
        orgObj.parentname = result[orgInx]["_source"]["departmentname"][qObj.language];
        orgObj.parentcode = result[orgInx]["_source"].departmentcode;
        orgObj.companycode = result[orgInx]["_source"].companycode;
        orgObj.mycode = result[orgInx]["_source"].empno;
        // var photo = config.mail.photo;
        // photo = photo.replace(/#empno#/g, orgObj.mycode);
        var photoUrl = config.photo;
        photoUrl = photoUrl.replace(/#sabun#/g, orgObj.mycode);
        orgObj.photo = photoUrl;
        orgObj.kinds = result[orgInx]["_source"]["@form"];
        orgObj.notesId = result[orgInx]["_id"];
        orgArr[orgInx] = orgObj;

    }
    util.writeSuccess(orgArr, res);
}
//유저아이콘 클릭했을시 나오는 정보
async function selectUserInfo(config, qObj, res, req) {
    var url = `${config.elastic_address[config.version]}/${config.user_push}/_search`;
    const id = config.elastic_id + ":" + config.elastic_pw;
    var authorization = Buffer.from(id, "utf8").toString("base64");

    console.log(url);
    // notesId 회사코드 소문자로 바꾸기
    var arr = qObj.notesId.split("/O=");
    let company = arr[1].toLowerCase();
    qObj.notesId = `${arr[0]}/O=${company}`;

    var query = {
        "query": {
            "match": {
                "reader": qObj.notesId
            }
        }
    };

    var total;
    var data = await axios({
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
            var data2 = response.data;
            total = response.data["hits"]["total"]["value"];
            return data2["hits"]["hits"];

        })
        .catch((error) => {
            throw new Error(error);
        });

    var resultObj2 = {};
    var resultArr = [];
    for (var i = 0; i < data.length; i++) {
        var resultObj = {};
        resultObj.deviceId = data[i]["_source"]["deviceId"];
        if (data[i]["_source"]["osKind"] == "A") {
            resultObj.osKind = "Android";
        } else if (data[i]["_source"]["osKind"] == "I") {
            resultObj.osKind = "iPhone";
        }
        if (data[i]["_source"]["deviceKind"] == "P") {
            resultObj.deviceKind = "Phone";
        } else if (data[i]["_source"]["deviceKind"] == "T") {
            resultObj.deviceKind = "Tablet";
        }
        resultObj.deviceName = data[i]["_source"]["deviceName"];
        var userReaders = data[i]["_source"]["reader"];
        var userReadersArr = userReaders.split("/");
        for (var k = 0; k < userReadersArr.length; k++) {
            if (userReadersArr[k].indexOf("CN=") > -1) {
                var userArr = userReadersArr[k].split("=");
                resultObj.name = userArr[1];
            }
            if (userReadersArr[k].indexOf("OU=") > -1) {
                var userArr = userReadersArr[k].split("=");
                resultObj.empno = userArr[1];
            }
        }
        resultObj.state = data[i]["_source"]["state"];
        resultArr.push(resultObj);
    }
    resultObj2.data = resultArr;
    resultObj2.total = total;
    util.writeSuccess(resultObj2, res);
}
module.exports = { get, post, put, del };