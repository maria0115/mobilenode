const config = require("../config/key.js");
const util = require("../lib/util.js");
const getCookie = async () => {
    let ltpa = require("ltpa");
    var obj = {};
    var domain = config.domino.domain;
    obj[domain] = config.domino.ltpa_dominosecret;
    console.log(obj);
    ltpa.setSecrets(obj);
    let userNameBuf = ltpa.generateUserNameBuf(config.domino.webadminid);
    let backendToken = ltpa.generate(userNameBuf, domain);
    var ltpatoken = {};
    ltpatoken["ltpatoken"] = backendToken;
    console.log(ltpatoken, "ltpatoken");
    ltpa = "LtpaToken=" + backendToken;
    console.log(ltpa, "ltpa@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@");    
    return ltpa;
};


module.exports = { getCookie};