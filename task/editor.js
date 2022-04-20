const util = require("../lib/util.js");
const axios = require("axios");
const cookie = require('cookie');

const get = async (config, qObj, res, req) => {
    util.writeSuccess({ success: false, message: "id, password 확인", alert: true }, res);

};
const post = async (config, qObj, res, req) => {
    if (qObj.cookie !== undefined) {
        const lang = cookie.parse(qObj.cookie);
        if (lang.hasOwnProperty("language")) {
            qObj.language = cookie.parse(qObj.cookie).language;
        }
    } else {
        qObj.language = "ko";
    }

    if (qObj.kind == "synap") {
        synapJobJson(config, qObj, res, req)
    }else if (qObj.kind == "drm") {

        drmDec(config, qObj, res, req)
    }
};
function synapJobJson(config, qObj, res, req) {

    var idx = req.headers.origin.indexOf("localhost");
    var host = config.appServer;
    if(!qObj.attach){
        idx == -1
            ? qObj.filePath = req.headers.origin + qObj.filePath
            : qObj.filePath = host + qObj.filePath;
    }
    qObj.convertType = 1;
    qObj.language=="ko"?qObj.convertLocale="ko_KR":qObj.convertLocale="en_US";
    var isHtml = qObj.filePath.toLowerCase().indexOf("opendocument");
    if(isHtml!=-1){
        qObj.fileType = "HTML";
    }
    axios({
        method: "post",
        url: host + `/SynapDocViewServer/jobJson`,
        data: qObj,
        headers: {
            "Content-Type": "application/json",
        },
    }).then((response) => {
        if(response.status==200){
            var resData = response.data;
            resData.viewUrlPath = host+"/SynapDocViewServer/" + resData.viewUrlPath;
            util.writeSuccess(resData, res)
        }
        // response.status==200?:"";
        // util.writeSuccess(response.data, res);
    }).catch(e => util.writeSuccess({data:false}, res))

}

function drmDec(config, qObj, res, req) {

    // var xhr = new XMLHttpRequest();

    // var formData = new FormData();
    // formData.append("servername","http://hfmaildev.insurance.co.kr");
    // formData.append("dbpath",qObj.url);
    // formData.append("unid",qObj.unid);
    // formData.append("filename",encodeURIComponent(qObj.name));

    // xhr.open('post',url,false);
    // // xhr.onreadystatechange = cb;
    // xhr.send(formData);
    // 


    // var formData = new FormData();
    // formData.append("servername", "http://hfmaildev.insurance.co.kr");
    // formData.append("dbpath", qObj.url);
    // formData.append("unid", qObj.unid);
    // formData.append("filename", encodeURIComponent(qObj.name));

    // formData.submit({
    //     host: "hfdev.insurance.co.kr",
    //     path: url,
    //     headers: {
    //         'cookie': qObj.cookie
    //     }
    // }, function (err, resp) {
    //     if (err) {
    //         util.writeSuccess(false, res);
    //         return;
    //     }
    //     util.writeSuccess(resp.data, res);

    //     // util.writeSuccess('Done', res);
    // });

    // servername=dfd&dbpath=dfd&unid=df&filename=dsfs
    //var svname = "http://hfmiappr.insurance.co.kr";
    var svname = "http://gwapp.ace-group.co.kr:8080";
    // var svname = "http://hfmail.insurance.co.kr";
    var url = "http://gwapp.ace-group.co.kr:8080" + config.drmDecUrl;


    url += `servername=${svname}&dbpath=${encodeURIComponent(qObj.url)}&unid=${qObj.unid}&filename=${encodeURIComponent(qObj.name)}`;
    


    axios({
        method: "get",
        url,
        headers: {
            "Cookie": qObj.cookie,
        },
    }).then((response) => {

        util.writeSuccess(response.data, res);
    }).catch(e => util.writeSuccess({ data: false }, res))
}

module.exports = { get, post };
