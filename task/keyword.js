const util = require("../lib/util.js");
const logger = require("../lib/log.js");
const config = require("../config/config.json");
const path = require("path");
const axios = require("axios");
const https = require('https');

const agent = new https.Agent({
    rejectUnauthorized: false
});

const id = config.elastic_id + ":" + config.elastic_pw;
var authorization = Buffer.from(id, "utf8").toString("base64");
// 최근검색
const get = async (config, qObj, res, req) => {
    if (config.customVersion.toLowerCase().indexOf("swg6") != 0) {
        //비표준, 사이트 수정이 필요한 경우 '/task/customise/...js' 를 수정 하십시오
        var functionName = qObj.functionName;
        const site = require("./customize/" + functionName + ".js");
        site.get(config, qObj, res, req); //사이트 커스터마이즈인 경우 별도함수 호출하고 종료
        return;
    }
    var url = `${config.elastic_address[config.version]}/${config.keyword_index[config.version]
        }/_search`;

    var query = `{
        "query":{
          "match": {
            "useremail": "${qObj.uid}"
          }
          
        },
        "size":0,
        "aggs": {
              "stations": {
                  "terms": {
                      "field": "keyword",
                      "order": {
                          "max_score": "desc"
                      }
                  },
                  "aggs": {
                      "max_score": {
                          "max": {
                              "field": "created"
                          }
                      }
                  }
              }
        }
      }`

    await axios({
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
            var result = response.data.aggregations.stations.buckets;
            // console.log('result', result);
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
// 자동완성
const post = async (config, qObj, res, req) => {
    if (config.customVersion.toLowerCase().indexOf("swg6") != 0) {
        //비표준, 사이트 수정이 필요한 경우 '/task/customise/...js' 를 수정 하십시오
        var functionName = qObj.functionName;
        const site = require("./customize/" + functionName + ".js");
        site.post(config, qObj, res, req); //사이트 커스터마이즈인 경우 별도함수 호출하고 종료
        return;
    }
    var url = `${config.elastic_address[config.version]}/${config.keyword_index[config.version]
        }/_search`;

    // console.log("여기와???????????");

    var query = `{
        "size": 0,
        "query": {
          "match": {
            "keyword.search": {
                "query": "${qObj.searchword}",
                "operator": "and"
              }
          }
        },
        "aggs": {
              "stations": {
                  "terms": {
                      "field": "keyword",
                      "order": {
                          "max_score": "desc"
                      }
                  },
                  "aggs": {
                      "max_score": {
                          "max": {
                              "script": {
                                  "source": "_score"
                              }
                          }
                      }
                  }
              }
          }
      }`;
    // console.log("여기와???????????", url, query);
    // console.log(authorization);
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
            // console.log(response)
            var result = response.data.aggregations.stations.buckets;
            console.log('result', result);
            res.statusCode = 200;
            res.setHeader("Content-type", "application/json; charset=UTF-8");
            res.send(JSON.stringify(result));
            return;

        })
        .catch((error) => {
            throw new Error(error);
        });


};
//단일 삭제
const put = async (config, qObj, res, req) => {
    if (config.customVersion.toLowerCase().indexOf("swg6") != 0) {
        //비표준, 사이트 수정이 필요한 경우 '/task/customise/...js' 를 수정 하십시오
        var functionName = qObj.functionName;
        const site = require("./customize/" + functionName + ".js");
        site.put(config, qObj, res, req); //사이트 커스터마이즈인 경우 별도함수 호출하고 종료
        return;
    }
    var url = `${config.elastic_address[config.version]}/${config.keyword_index[config.version]}/_delete_by_query`;

    console.log("단일 삭제 들어옴");

    var query = `{
        "query": {
          "bool":{
            "must":[
                {"term": {"keyword": "${qObj.searchword}"}},
                {"term": {"useremail": "${qObj.uid}"}}
              ]
          }
        }
      }`;
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
            // console.log(response.data.deleted);
            if (response.data.deleted >= 1) {
                console.log("단일 삭제 완료");
                res.statusCode = 200;
                res.setHeader("Content-type", "application/json; charset=UTF-8");
                res.send();
                return;
            }
        })
        .catch((error) => {
            throw new Error(error);
        });
};
//전체 삭제
const del = async (config, qObj, res, req) => {
    if (config.customVersion.toLowerCase().indexOf("swg6") != 0) {
        //비표준, 사이트 수정이 필요한 경우 '/task/customise/...js' 를 수정 하십시오
        var functionName = qObj.functionName;
        const site = require("./customize/" + functionName + ".js");
        site.del(config, qObj, res, req); //사이트 커스터마이즈인 경우 별도함수 호출하고 종료
        return;
    }
    var url = `${config.elastic_address[config.version]}/${config.keyword_index[config.version]}/_delete_by_query`;

    console.log("전체 삭제 들어옴");

    var query = `{
        "query": {
          "match": {
            "useremail": "${qObj.uid}"
          }
        }
      }`;
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
            if (response.data.deleted >= 1) {
                console.log("전체 삭제 완료");
                res.statusCode = 200;
                res.setHeader("Content-type", "application/json; charset=UTF-8");
                res.send();
                return;
            }
        })
        .catch((error) => {
            throw new Error(error);
        });
};

module.exports = { get, post, put, del };