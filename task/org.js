const util = require("../lib/util.js");
const config = require("../config/config.json");
const axios = require("axios");

const https = require('https');

const agent = new https.Agent({
    rejectUnauthorized: false
});

const migration = async () => {

    let ltpa = require("ltpa");
    var obj = {};
    var domain = config.domino.domain;
    obj[domain] = config.domino.ltpa_dominosecret;
    // console.log(obj);
    ltpa.setSecrets(obj);
    let userNameBuf = ltpa.generateUserNameBuf(config.domino.webadminid);
    let backendToken = ltpa.generate(userNameBuf, domain);
    var ltpatoken = {};
    ltpatoken["ltpatoken"] = backendToken;
    // console.log(ltpatoken, "ltpatoken");
    ltpa = "LtpaToken=" + backendToken;
    // console.log(ltpa, "ltpa");

    //임직원 정보
    for (var pageInx = 0; pageInx < 10000; pageInx++) {
        var url = config.host + config.personInfo.replace("#page#", pageInx);
        var result = await axios({
            method: "get",
            url: url,
            httpsAgent: agent,
            headers: {
                "Content-Type": "application/json",
                "Cookie": ltpa + "; DWP_LANG=ko; language=ko"
            },
        })
            .then((response) => {
                return response.data;
            })
            .catch((error) => {
                throw new Error(error);
            });
        try {
            if (typeof result == undefined || typeof result == "undefined" || result == null) {
                break;
            } else if (result.length == 0) {
                break;
            }
            console.log("*************** Person Migration 수행 *******************");
            console.log(url);
            var indexObj = {};
            var dataObj = {};
            var bulkList = "";
            for (var resInx = 0; resInx < result.length; resInx++) {
                var category;
                try {
                    category = result[resInx]["@category"];
                } catch (e) { }
                var isContinue = false;
                if (typeof category == undefined || typeof category == "undefined" || category == null) {
                    isContinue = true;
                }
                if (category == false) {
                    isContinue = true;
                }
                if (isContinue) {
                    var jsonInfo = JSON.parse(result[resInx]["_jsoninfo"]);
                    if (jsonInfo.iscurrentcorp.toLowerCase() == "y" && result[resInx]["_Isconc"] != 1) {
                        // console.log(jsonInfo);
                        var bulk = {};
                        var bulk2 = {};
                        var id = jsonInfo["notesid"];
                        if (id.toLowerCase().indexOf("cn=") == -1) {
                            var idArr = id.split('/');
                            if (idArr.length == 3) {
                                id = "CN=" + idArr[0] + "/OU=" + idArr[1] + "/O=" + idArr[2];
                            } else if (idArr.length == 2) {
                                id = "CN=" + idArr[0] + "/O=" + idArr[1];
                            }
                        }

                        indexObj["_index"] = config.elasticPersonDB;
                        indexObj["_id"] = id.toUpperCase();
                        indexObj["_type"] = "_doc";

                        bulk["index"] = indexObj;
                        bulkList += JSON.stringify(bulk) + "\n";

                        var nameArr = jsonInfo["name"].split(',');
                        var nameObj = {};
                        for(var i = 0; i < nameArr.length; i++) {
                            nameObj[util.strLeft(nameArr[i], ":")] = util.strRight(nameArr[i], ":");
                        }
                        dataObj["name"] = nameObj;
                        dataObj["empno"] = result[resInx]["_empno"];

                        var positionArr = jsonInfo["dutyname"].split(',');
                        var positionObj = {};
                        for(var i = 0; i < positionArr.length; i++) {
                            positionObj[util.strLeft(positionArr[i], ":")] = util.strRight(positionArr[i], ":");
                        }
                        dataObj["position"] = positionObj;

                        var gradeArr = jsonInfo["posname"].split(',');
                        var gradeObj = {};
                        for(var i = 0; i < gradeArr.length; i++) {
                            gradeObj[util.strLeft(gradeArr[i], ":")] = util.strRight(gradeArr[i], ":");
                        }
                        dataObj["grade"] = gradeObj;

                        var companynameArr = jsonInfo["comname"].split(',');
                        var companynameObj = {};
                        for(var i = 0; i < companynameArr.length; i++) {
                            companynameObj[util.strLeft(companynameArr[i], ":")] = util.strRight(companynameArr[i], ":");
                        }
                        dataObj["companyname"] = companynameObj;
                        dataObj["companycode"] = result[resInx]["_comcode"];

                        var departmentnameArr = jsonInfo["orgname"].split(',');
                        var departmentnameObj = {};
                        for(var i = 0; i < companynameArr.length; i++) {
                            departmentnameObj[util.strLeft(departmentnameArr[i], ":")] = util.strRight(departmentnameArr[i], ":");
                        }
                        dataObj["departmentname"] = departmentnameObj;
                        dataObj["departmentcode"] = jsonInfo["orgcode"];
                        dataObj["isconc"] = result[resInx]["_Isconc"];
                        dataObj["iscurrentcorp"] = result[resInx]["_iscurrentcorp"];
                        dataObj["mobile"] = jsonInfo["mobile"];
                        dataObj["office"] = jsonInfo["office"];
                        dataObj["email"] = jsonInfo["internetid"]+"@"+jsonInfo["maildomain"];
                        dataObj["@id"] = jsonInfo["notesid"];
                        dataObj["@form"] = result[resInx]["@form"];
                        dataObj["@retired"] = "N";
                        dataObj["approvalInfo"] = "S^"+jsonInfo["name"]+"^"+jsonInfo["empno"]+"^"+jsonInfo["notesid"]+"^"+jsonInfo["orgcode"]+"^"+jsonInfo["porgcode"]+"^"+jsonInfo["posname"]+"^"+jsonInfo["poscode"]+"^"+jsonInfo["posname"]+"^"+jsonInfo["poscode"]+"^"+jsonInfo["comcode"]+"^"+jsonInfo["orgname"]+"^"+jsonInfo["comname"]+"^^";
                        dataObj["unid"] = jsonInfo["unid"];
                        bulk2 = dataObj;
                        bulkList += JSON.stringify(bulk2) + "\n";
                    }
                }
            }
            await bulkQuery(bulkList);

        } catch (error) {

        }
    }
    //부서 정보
    for (var pageInx = 0; pageInx < 10000; pageInx++) {
        var url = config.host + config.departmentInfo.replace("#page#", pageInx);
        var result = await axios({
            method: "get",
            url: url,
            httpsAgent: agent,
            headers: {
                "Content-Type": "application/json",
                "Cookie": ltpa + "; DWP_LANG=ko; language=ko"
            },
        })
            .then((response) => {
                return response.data;
            })
            .catch((error) => {
                throw new Error(error);
            });
        try {
            if (typeof result == undefined || typeof result == "undefined" || result == null) {
                break;
            } else if (result.length == 0) {
                break;
            }
            console.log("*************** Department Migration 수행 *******************");
            console.log(url);
            var indexObj = {};
            var dataObj = {};
            var bulkList = "";
            for (var resInx = 0; resInx < result.length; resInx++) {
                var jsonInfo = JSON.parse(result[resInx]["_jsoninfo"]);
                var bulk = {};
                var bulk2 = {};

                indexObj["_index"] = config.elasticPersonDB;
                indexObj["_id"] = result[resInx]["@unid"].toUpperCase();
                indexObj["_type"] = "_doc";

                bulk["index"] = indexObj;
                bulkList += JSON.stringify(bulk) + "\n";

                var nameArr = jsonInfo["orgname"].split(',');
                var nameObj = {};
                nameObj["ko"] = util.strRight(nameArr[0], ":");
                nameObj["en"] = util.strRight(nameArr[1], ":");
                dataObj["name"] = nameObj;
                dataObj["empno"] = jsonInfo["orgcode"];

                var companynameArr = jsonInfo["comname"].split(',');
                var companynameObj = {};
                companynameObj["ko"] = util.strRight(companynameArr[0], ":");
                companynameObj["en"] = util.strRight(companynameArr[1], ":");
                dataObj["companyname"] = companynameObj;
                dataObj["companycode"] = jsonInfo["comcode"];

                var departmentnameArr = jsonInfo["fullorgname"].split(','); //ko : departmentnameArr[0], en : departmentnameArr[1]
                var departmentnameArrKo = util.strRight(departmentnameArr[0], ":").split('>');
                var departmentnameArrEn = util.strRight(departmentnameArr[1], ":").split('>');
                
                var departmentnameObj = {};
                if (departmentnameArrKo.length >= 2) {
                    departmentnameObj["ko"] = departmentnameArrKo[departmentnameArrKo.length - 2];
                    departmentnameObj["en"] = departmentnameArrEn[departmentnameArrEn.length - 2];
                } else{
                    departmentnameObj["ko"] = "";
                    departmentnameObj["en"] = "";
                }
                dataObj["departmentname"] = departmentnameObj;
                
                var departmentcodeArr = jsonInfo["fullorgcode"].split(','); 
                if (departmentcodeArr.length >= 2) {
                    dataObj["departmentcode"] = departmentcodeArr[departmentcodeArr.length - 2];
                } else{
                    dataObj["departmentcode"] = "";
                }
                
                dataObj["@id"] = jsonInfo["orgcode"];
                dataObj["@form"] = result[resInx]["@form"];
                dataObj["@retired"] = "N";
                dataObj["unid"] = jsonInfo["unid"];

                bulk2 = dataObj;
                bulkList += JSON.stringify(bulk2) + "\n";

            }
            await bulkQuery(bulkList);

        } catch (error) {

        }
    }



};

async function update() {
    var url = `${config.elastic_address[config.version]}/${config.elasticPersonDB}/_update_by_query`;

    const id = config.elastic_id + ":" + config.elastic_pw;
    var authorization = Buffer.from(id, "utf8").toString("base64");

    console.log(url);

    var query = {
        "script": {
            "source": "ctx._source['@retired'] = 'Y'",
            "lang": "painless"
        },
        "query": {
            "bool": {
                "filter": [
                    {
                        "bool": {
                            "should": [
                                {
                                    "term": {
                                        "@form": "Person"
                                    }
                                },
                                {
                                    "term": {
                                        "@form": "Department"
                                    }
                                }
                            ],
                            "minimum_should_match": 1
                        }
                    }
                ]
            }
        }
    };
    axios({
        method: "post",
        url: url,
        httpsAgent: agent,
        data: query,
        headers: {
            Authorization: "Basic " + authorization,
            "Content-Type": "application/json",
        },
    })
        .then((res) => {
            console.log("*************** Update 완료 *****************");
            migration();
            return;
        })
        .catch((error) => {
            console.log(error);
            migration();
            return;
            //throw new Error(error);
        });

}

async function bulkQuery(bulkList) {
    var url = `${config.elastic_address[config.version]}/${config.elasticPersonDB}/_bulk`;

    const id = config.elastic_id + ":" + config.elastic_pw;
    var authorization = Buffer.from(id, "utf8").toString("base64");

    console.log(url);
    // console.log(bulkList);

    await axios({
        method: "post",
        url: url,
        httpsAgent: agent,
        data: bulkList,
        headers: {
            Authorization: "Basic " + authorization,
            "Content-Type": "application/json",
        },
    })
        .then((response) => {
            var data = response.data;
            if (data["errors"] == false) {
                console.log("*************** Bulk END *****************");
                res.statusCode = 200;
                res.setHeader("Content-type", "application/json; charset=UTF-8");
                res.send(response.data);
                return;
            }
        })
        .catch((error) => {
            throw new Error(error);
        });
}

module.exports = { migration, update };