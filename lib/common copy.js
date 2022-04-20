const util = require("./util.js");
const config = require("../config/config.json");
const axios = require("axios");
const cookie = require('cookie');

//사용자 정보 구하기
async function getUserInfo(qObj) {
    var url = `${config.elastic_address[config.version]}/${config.elasticPersonDB}/_search`;
    // console.log("qObj.readers : ", qObj.readers);
    const id = config.elastic_id + ":" + config.elastic_pw;
    var authorization = Buffer.from(id, "utf8").toString("base64");
    var query = `{
        "query": {
          "match": {
            "_id": "${qObj.readers.toUpperCase()}"
          }
        }
      }`;
    console.log(url);
    var result = await axios({
        method: "post",
        url: url,
        data: query,
        headers: {
            Authorization: "Basic " + authorization,
            "Content-Type": "application/json",
        },
    })
        .then((response) => {
            var data = response.data;
            // console.log(data);
            return data["hits"]["hits"][0]["_source"];
        })
        .catch((error) => {
            throw new Error(error);
        });
    /* result = 
    {
        name: { ko: '박광순', en: 'Park Gwangsun' },
        empno: '209003',
        position: { ko: '사업부장', en: '사업부장' },
        grade: { ko: '수석연구원', en: 'Principal Research Engineer' },
        companyname: { ko: '새롬정보', en: 'Saerom' },
        companycode: 'K-SIS',
        departmentname: { ko: 'GW사업부', en: 'GW Business Department' },
        departmentcode: 'K-SIS_200001',
        isconc: '',
        mobile: '010-4653-9636',
        office: '02-2105-2500',
        email: 'parking7@saerom.co.kr',
        '@id': '박광순/209003/SIS',
        '@form': 'Person',
        '@retired': 'N'
    }
    */
    return result;
}
//사용자 메일DB 구하기
async function getMailPath(qObj) {
    var url = `${config.host_webserver + config.mail.path}`;
    var result = await axios({
        method: 'get',
        url: url,
        headers: {
            "Cookie": qObj.cookie,
            'Content-Type': 'application/json'
        }
    }).then((response) => {
        result = response.data.path;
        return result;

    })
    return result;
};
// 첨부파일 크기 변환
function formatBytes(bytes, decimals) {
    //bytes 크기로만 입력
    //decimals 소수점 자리, 2면 소수점 둘째까지 나타냄
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
//쿠키에 있는 language 값에 따라 언어 변환
function languageConverter(val, language, separator1, separator2) {
    if (typeof val == "string") {
        // val = ko:박광순,en:Park Gwangsun
        var valArr = val.split(separator1); //["ko:박광순","en:Park Gwangsun"]
        var obj = {};
        var key, val, keyVal = "";
        for (var langIndex = 0; langIndex < valArr.length; langIndex++) {
            keyVal = valArr[langIndex];  //ko:박광순
            key = util.strLeft(keyVal, separator2); //ko
            val = util.strRight(keyVal, separator2); //박광순
            obj[key] = val; // {"ko":"박광순","en":"Park Gwangsun"}
        }
    }
    return obj[language];
}
// 2개 구분자가 있는 String을 객체 안 배열로 변환 
function strToArr(val, separator1, separator2) {
    var resultArr = [];
    var valArr = val.split(separator1);
    for (var valArrIdx = 0; valArrIdx < valArr.length; valArrIdx++) {
        var valItemArr = valArr[valArrIdx].split(separator2);
        resultArr[valArrIdx] = valItemArr;
    }
    return resultArr;
}

function urlConverter(data, qObj) {
    //m60call://m60.saerom.co.kr/mobile_index/viewer?urladdress=${url}&token=${LtpaToken}
    // console.log(data);
    try {
        if (data.indexOf('<a href="') > -1) {
            var m60url = util.strRight(config.appServer, "//");
            var ltpaToken = cookie.parse(qObj.cookie);
            var urldataArr = data.split('<a href="');
            var urlArr = [];
            for (var i = 1; i < urldataArr.length; i++) {
                urlArr.push(util.strLeft(urldataArr[i], '"'));
            }
            var gwUrl = util.strRight(config.host, "//");
            for (var urlArrIdx = 0; urlArrIdx < urlArr.length; urlArrIdx++) {
                var url = `m60call://browser?urladdress=${m60url}/mobile_index/viewer?url=#url#&token=#ltpaToken#`;
                // var url = `m60call://${m60url}/mobile_index/viewer?urladdress=#url#&token=#ltpaToken#`;
                if (urlArr[urlArrIdx].indexOf(`${gwUrl}`) > -1 || urlArr[urlArrIdx].indexOf(`${m60url}`) > -1) {
                    url = url.replace("#ltpaToken#", ltpaToken.LtpaToken);
                } else {
                    url = url.replace("#ltpaToken#", "");
                }
                url = url.replace("#url#", urlArr[urlArrIdx]);
                data = data.replace(urlArr[urlArrIdx], url);
            }
        }
    } catch (e) {
        console.log(e);
    }

    return data;
}
module.exports = {
    getUserInfo,
    getMailPath,
    formatBytes,
    languageConverter,
    strToArr,
    urlConverter
};