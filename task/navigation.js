const util = require("../lib/util.js");
const logger = require("../lib/log.js");
const config = require("../config/config.json");
const path = require("path");
const axios = require("axios");
const cookie = require('cookie');
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

    if (qObj.cookie !== undefined) {
        const lang = cookie.parse(qObj.cookie);
        if (lang.hasOwnProperty("language")) {
            qObj.language = cookie.parse(qObj.cookie).language;
        }
    } else {
        qObj.language = "ko";
    }

    var url = config.host;
    if (
        typeof qObj.category == "undefined" ||
        typeof qObj.category == undefined ||
        qObj.category == null ||
        qObj.category == "") {
        url = url + config.navigation.gnb;
    } else {
        if (qObj.category == config.freeBoardLnb) {
            url = url + config.navigation.lnb_free.replace(/#category#/, qObj.category);
        } else {
            url = url + config.navigation.lnb.replace(/#category#/, qObj.category);
        }
    }
    console.log(url);
    await getNavigation(qObj, res, req, url);
};
const post = async (config, qObj, res, req) => {
    if (config.customVersion.toLowerCase().indexOf("swg6") != 0) {
        //비표준, 사이트 수정이 필요한 경우 '/task/customise/...js' 를 수정 하십시오
        var functionName = qObj.functionName;
        const site = require("./customize/" + functionName + ".js");
        site.post(config, qObj, res, req); //사이트 커스터마이즈인 경우 별도함수 호출하고 종료
        return;
    }
    //여기 부터 표준 api 코드 작성
};
const put = async (config, qObj, res, req) => {
    if (config.customVersion.toLowerCase().indexOf("swg6") != 0) {
        //비표준, 사이트 수정이 필요한 경우 '/task/customise/...js' 를 수정 하십시오
        var functionName = qObj.functionName;
        const site = require("./customize/" + functionName + ".js");
        site.put(config, qObj, res, req); //사이트 커스터마이즈인 경우 별도함수 호출하고 종료
        return;
    }
    //여기 부터 표준 api 코드 작성
};
const del = async (config, qObj, res, req) => {
    if (config.customVersion.toLowerCase().indexOf("swg6") != 0) {
        //비표준, 사이트 수정이 필요한 경우 '/task/customise/...js' 를 수정 하십시오
        var functionName = qObj.functionName;
        const site = require("./customize/" + functionName + ".js");
        site.del(config, qObj, res, req); //사이트 커스터마이즈인 경우 별도함수 호출하고 종료
        return;
    }
    //여기 부터 표준 api 코드 작성
};

async function getNavigation(qObj, res, req, url) {
    // http://localhost:4001/api/navigation?category=
    // console.log(url);
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

    // children 추가
    // if (
    //     typeof qObj.category !== "undefined" &&
    //     typeof qObj.category !== undefined &&
    //     qObj.category !== null &&
    //     qObj.category !== "") {
    //         for(var n in data){
    //             if(data[n]["_level"] === 1){
    //                 data.splice(n, 1);
    //             }
    //         }
    //         var treeArr = await tree(data, qObj);
    //         data = treeArr;
    // }

    var resultArr = [];
    for (var dataIdx = 0; dataIdx < data.length; dataIdx++) {
        if (data[dataIdx]["_level"] !== 1) {

            var resultObj = {};

            var titleArr = data[dataIdx]["_title"].split(",");
            var jsonObj = {};
            for (var num in titleArr) {
                jsonObj[util.strLeft(titleArr[num], ":")] = util.strRight(titleArr[num], ":");
            }


            resultObj.title = jsonObj[qObj.language];
            // resultObj.unid = data[dataIdx]["@unid"];
            resultObj.lnbid = data[dataIdx]["_lnbid"];
            resultObj.category = data[dataIdx]["_link"];
            resultObj.type = data[dataIdx]["_lnblink"];
            resultObj.sort = data[dataIdx]["Sort"];
            // if(data[dataIdx].children){
            //     resultObj.children = data[dataIdx]["children"];
            // }
            resultArr.push(resultObj);
        }
    }
    //sort 번호순으로 정렬
    resultArr.sort(function (a, b) {
        return a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0;
    });
    util.writeSuccess(resultArr, res);
}

// children 추가
async function tree(data, qObj) {
    var tree = [];
    var arr1 = [];
    // c = {};
    // var item, id, parent;
    tree = data;
    for (var i = 0; i < data.length; i++) {
        tree[i]['children'] = [];
        for (var idx in data) {
            var temp = {};
            if (data[i]["_lnbid"] === data[idx]["_pid"]) {
                temp.category = data[idx]["_lnbid"];
                temp.up = data[idx]["_pid"];

                var t = data[idx]["_title"].split(",");
                var jsonObj = {};
                for (var num in t) {
                    jsonObj[util.strLeft(t[num], ":")] = util.strRight(t[num], ":");
                }
                temp.title = jsonObj[qObj.language];
                temp.type = data[idx]["_link"];
                tree[i]['children'].push(temp);

                arr1.push(idx);
            }
        }
        // var item = {};
        // item.name = data[i].nodetitle.ko;
        // id = data[i]["_lnbid"];
        // parent = data[i]["_pid"];

        // c[id] = c[id] || [];
        // data[i]['children'] = c[id];
        // if (parent != "") {
        //     c[parent] = c[parent] || [];

        //     c[parent].push(data[i]);

        // } else {
        //     // console.log("else",item)
        //     tree.push(data[i]);
        // }
        // console.log(c)
    };
    arr1.sort(function (a, b) {
        return b - a;
    });

    for (var cnt in arr1) {
        tree.splice(arr1[cnt], 1);
    }
    return tree;
}


module.exports = { get, post, put, del };