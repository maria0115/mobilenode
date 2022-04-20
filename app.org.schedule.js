/**
 * 증분 색인기임 (일정 시간(분)을 반복하여 업데이트된 문서를 색인처리함)
 */
const config = require("./config/config.json");
const util = require("./lib/util.js");
const logger = require("./lib/log.js");
var schedule = require("node-schedule");
const path = require("path");
const fs = require("fs");
/*
* * * * * *
┬ ┬ ┬ ┬ ┬ ┬
│ │ │ │ │ |
│ │ │ │ │ └ 주중반복시기 (0 - 7) (0 or 7 일요일)
│ │ │ │ └───── 달 (1 - 12)
│ │ │ └────────── 일 (1 - 31)
│ │ └─────────────── 시 (0 - 23)
│ └──────────────────── 분 (0 - 59)/N => N분에 한번씩 수행
└───────────────────────── 초 (0 - 59, 생략가능)
*/
const org = require("./task/org.js");

var isFirst = true;
//ftindex.masterUpdate(isFirst); //시작할때 한번 실행 후 이후 반복 수행
var masterTimer = 0;
try {
    masterTimer = config.org.updateinterval; //반복 시
} catch (e) { }
console.log("config.org.updateinterval=" + masterTimer);
if (
    typeof masterTimer == "undefined" ||
    typeof masterTimer == undefined ||
    masterTimer == null
) {
    masterTimer = 0;
}
masterTimer = 0; //test 용
if (masterTimer > 0) {
    //시간 단위의 스케줄 이기 때문에 초, 분 자리는 '*' 아닌 0 채운다.
    schedule.scheduleJob(
        "0 */" + masterTimer + " * * *",
        function () {
            console.log(
                masterTimer + "시간 마다 실행"
            );
            org.update(); 
        }
    );
}

org.update(); //test용
