const config = require("./config/config.json");
//const config = require("./config.json");
const util = require("./lib/util.js");
const logger = require("./lib/log.js");

const path = require("path");
const fs = require("fs");
var watch = require("node-watch");
//const axios = require("axios");
var schedule = require("node-schedule");
const request = require("sync-request");
var IS_TEST = config.wasSync.testOnly;

function getByteArray(filePath) {
    let fileData = fs.readFileSync(filePath).toString("hex");
    let result = [];
    for (var i = 0; i < fileData.length; i += 2)
        result.push("0x" + fileData[i] + "" + fileData[i + 1]);
    return result;
}

function replaceAll(str, searchStr, replaceStr) {
    return str.split(searchStr).join(replaceStr);
}

const clientToServer = async (qObj) => {
    try {
        //var data = getByteArray(qObj.filePath);
        // var stats = fs.statSync(qObj.filePath);
        // var mtime = stats.mtimeMs; //최종수정일
        // var size = stats.size; //크기
        // var fileDir = path.dirname(qObj.filePath);
        // var fileName = path.basename(qObj.filePath);
        // console.log(stats, fileDir, fileName);
        //console.log(result);

        function getFiles(dir, files_) {
            files_ = files_ || [];
            var files = fs.readdirSync(dir);
            for (var i in files) {
                var fileObj = {};
                var filePath = dir + "/" + files[i];
                //console.log("파일 스캔...", files[i]);
                fileObj["path"] = filePath;
                //var stats = fs.statSync(filePath);
                //fileObj.fileSize = stats.size;
                //fileObj.lastModified = stats.mtimeMs;
                if (fs.statSync(filePath).isDirectory()) {
                    getFiles(filePath, files_);
                } else {
                    files_.push(fileObj);
                }
            }
            return files_;
        }

        var baseDir = __dirname;
        if (IS_TEST) {
            baseDir = __dirname + path.sep + "tmp_client";
        } else {
            baseDir = config.wasSync.syncDirectory;
            if (
                typeof baseDir == undefined ||
                typeof baseDir == "undefined" ||
                baseDir == null ||
                baseDir == ""
            ) {
                baseDir = __dirname;
            }
        }
        console.log("디렉터리의 동기화 대상 파일목록 작성...", baseDir);
        var files = getFiles(baseDir);
        var targetFiles = [];
        console.log(
            "디렉터리의 동기화 비대상 파일 정리 시작...",
            baseDir,
            config.wasSync.syncExceptionFiles
        );
        for (var index = 0; index < files.length; index++) {
            var fileObj = files[index];
            var filePath = fileObj.path;
            var relPath = util.strRight(filePath, baseDir);
            fileObj.relPath = relPath;
            var exptionFile = false;
            try {
                for (
                    var index2 = 0;
                    index2 < config.wasSync.syncExceptionFiles.length;
                    index2++
                ) {
                    var exptionFilePath =
                        config.wasSync.syncExceptionFiles[index2];
                    if (relPath.indexOf(exptionFilePath) == 0) {
                        exptionFile = true;
                        break;
                    }
                }
            } catch (error) {
                console.error(error);
            }
            //console.log(filePath + "===>", exptionFile);
            if (exptionFile) {
            } else {
                targetFiles.push(fileObj);
            }
        }
        //console.log(targetFiles);
        for (var index = 0; index < targetFiles.length; index++) {
            var fileObj = targetFiles[index];
            var reqObj = JSON.parse(JSON.stringify(fileObj));
            var stats = fs.statSync(fileObj.path);
            reqObj.fileSize = stats.size;
            reqObj.lastModified = stats.mtimeMs;
            //console.log("Update File....", fileObj.relPath);
            //if (reqObj.relPath.indexOf("temp.txt") != -1) {
            //    console.log("Update File....", reqObj.lastModified);
            _fileToServer(reqObj);
            //}
        }
    } catch (error) {
        console.error(error);
    }
};

const updateFileFromServer = async () => {
    var url = config.wasSync.syncServerAddr + "/sync/serverFileList";
    var res = null;
    var serverFiles = null;
    try {
        res = request("GET", url);
        var rslt = JSON.parse(res.getBody("utf8"));
        if (rslt.result) {
            serverFiles = rslt.data;
            console.error("성공:", serverFiles);
        }
    } catch (error) {
        //console.error("*********", error.message);
        console.error("---------------------------");
        var rslt = error.message;
        if (rslt.indexOf('"result":true') != -1) {
            var resFilePath = util.strRight(rslt, '"data"');
            //console.log("1", resFilePath);
            resFilePath = util.strRight(resFilePath, ":");
            //console.log("2", resFilePath);
            resFilePath = util.strLeftBack(resFilePath, "]", true);
            //console.error("성공:", resFilePath);
            serverFiles = JSON.parse(resFilePath);
        } else {
            var resFilePath = util.strRight(rslt, '"description"');
            resFilePath = util.strRight(resFilePath, ":");
            resFilePath = util.strRight(resFilePath, '"');
            resFilePath = util.strLeftBack(resFilePath, '"');
            console.error("실패:", resFilePath);
        }
    } finally {
        //console.log(serverFiles);
        //여기에 서버로부터 받은 파일 정보를 이용하여 내 파일들을 업데이트
        var baseDir = __dirname;
        if (IS_TEST) {
            baseDir = __dirname + path.sep + "tmp_client";
        } else {
            baseDir = config.wasSync.syncDirectory;
            if (
                typeof baseDir == undefined ||
                typeof baseDir == "undefined" ||
                baseDir == null ||
                baseDir == ""
            ) {
                baseDir = __dirname;
            }
        }
        if (serverFiles != null) {
            for (var index = 0; index < serverFiles.length; index++) {
                var fileObj = serverFiles[index];
                var relPath = fileObj.relPath;
                var lastModified = fileObj.lastModified; //서버 파일 수젇일
                var taregetPath = baseDir + relPath;
                var isUpdated = false;
                if (!fs.existsSync(taregetPath)) {
                    //서버에 추가된 파알
                    // console.log(
                    //     "서버에서 받은 파일이 내 폴더에는 없음: 추가 대상",
                    //     fileObj
                    // );
                    isUpdated = true;
                } else {
                    var stats = fs.statSync(taregetPath);
                    var mtime = stats.mtimeMs; //최종수정일
                    if (lastModified > mtime) {
                        isUpdated = true;
                        // console.log(
                        //     "서버에서 받은 파일이 더 최신임: 업데이트 대상:",
                        //     relPath,
                        //     ", serverLastModified:",
                        //     lastModified,
                        //     " VS myLastModified:",
                        //     mtime
                        // );
                    }
                }
                if (isUpdated) {
                    var url =
                        config.wasSync.syncServerAddr + "/sync/serverFile";
                    var res = null;
                    var response = null;
                    try {
                        res = request("POST", url, { json: fileObj });
                        var rslt = JSON.parse(res.getBody("utf8"));
                        if (rslt.result) {
                            response = rslt.data;
                            console.error("성공:", serverFiles);
                        }
                    } catch (error) {
                        //console.error("*********", error.message);
                        var rslt = error.message;
                        //console.error("---------------------------", rslt);
                        if (rslt.indexOf('"result":true') != -1) {
                            var resFilePath = util.strRight(rslt, '"data"');
                            //console.log("1", resFilePath);
                            resFilePath = util.strRight(resFilePath, ":");
                            //console.log("2", resFilePath);
                            resFilePath = util.strLeftBack(resFilePath, "}");
                            resFilePath = util.strLeftBack(
                                resFilePath,
                                "}",
                                true
                            );
                            //console.error("성공:", resFilePath);
                            response = JSON.parse(resFilePath);
                        } else {
                            var resFilePath = util.strRight(
                                rslt,
                                '"description"'
                            );
                            resFilePath = util.strRight(resFilePath, ":");
                            resFilePath = util.strRight(resFilePath, '"');
                            resFilePath = util.strLeftBack(resFilePath, '"');
                            console.error("실패:", resFilePath);
                        }
                    } finally {
                        //console.log(response);
                        if (response != null) {
                            var sep = path.sep;
                            var filePath = response.relPath;
                            var fileSize = response.fileSize;
                            var lastModified = response.lastModified;
                            var base64Str = response.base64;
                            var baseDir = __dirname;
                            var tmpDir = baseDir;
                            if (IS_TEST) {
                                tmpDir = baseDir + sep + "tmp_client";
                            } else {
                                tmpDir = config.wasSync.syncDirectory;
                                if (
                                    typeof tmpDir == undefined ||
                                    typeof tmpDir == "undefined" ||
                                    tmpDir == null ||
                                    tmpDir == ""
                                ) {
                                    tmpDir = baseDir;
                                }
                            }
                            if (!fs.existsSync(tmpDir)) {
                                fs.mkdirSync(tmpDir, { recursive: true });
                            }
                            var taregetPath = tmpDir + filePath;
                            taregetPath = replaceAll(taregetPath, sep, "/");

                            var tDir = util.strLeftBack(taregetPath, "/");
                            if (!fs.existsSync(tDir)) {
                                fs.mkdirSync(tDir, { recursive: true });
                            }
                            // console.log(
                            //     "서버로부터 받은파일을 내 Workspace에 쓰기시도...",
                            //     taregetPath
                            // );
                            if (fs.existsSync(taregetPath)) {
                                var base64 = fs.readFileSync(taregetPath, {
                                    encoding: "base64",
                                });
                                if (base64Str != base64) {
                                    //파일의 내용이 다른 경우만 변경
                                    var rslt = fs.writeFileSync(
                                        taregetPath,
                                        base64Str,
                                        {
                                            encoding: "base64",
                                        }
                                    );
                                    console.log(
                                        "서버로부터 받은파일을 내 Workspace에 쓰기성공:",
                                        taregetPath
                                    );
                                } else {
                                    // console.log(
                                    //     "서버로부터 받은파일과 내 Workspace의 파일 내용이 변경사항이 없어서 쓰기취소:",
                                    //     taregetPath
                                    // );
                                }
                            } else {
                                var rslt = fs.writeFileSync(
                                    taregetPath,
                                    base64Str,
                                    {
                                        encoding: "base64",
                                    }
                                );
                                console.log(
                                    "서버로부터 받은파일을 내 Workspace에 추가 성공:",
                                    taregetPath
                                );
                            }
                        }
                    }
                }
            }
        }
    }
};

const _fileToServer = async (fileObj) => {
    try {
        //서버로부터 파일 목록 수신
        var url = config.wasSync.syncServerAddr + "/sync/clientToServer";
        console.log(fileObj.path + " ==> " + url);
        var res = null;
        /**
         * var filePath = qObj.filePath;
            var fileName = qObj.fileName;
            var fileSize = qObj.fileSize;
            var lastModified = qObj.lastModified;
            var base64Str = qObj.base64;
         */
        const base64 = fs.readFileSync(fileObj.path, {
            encoding: "base64",
        });
        var postData = {
            filePath: fileObj.relPath,
            fileName: fileObj.fileName,
            fileSize: fileObj.fileSize,
            lastModified: fileObj.lastModified,
            base64: base64,
        };
        try {
            res = request("POST", url, { json: postData });
            var rslt = JSON.parse(res.getBody("utf8"));
            if (rslt.result) {
                var serverFiles = rslt.description;
                console.error(
                    "**********************************************업데이트 성공:",
                    serverFiles
                );
            }
        } catch (error) {
            //console.error("*********", error.message);
            var rslt = error.message;
            if (rslt.indexOf('"result":true') != -1) {
                var resFilePath = util.strRight(rslt, '"description"');
                resFilePath = util.strRight(resFilePath, ":");
                resFilePath = util.strRight(resFilePath, '"');
                resFilePath = util.strLeft(resFilePath, '"');
                console.error(
                    "**********************************************업데이트  성공:",
                    resFilePath
                );
            } else {
                var resFilePath = util.strRight(rslt, '"description"');
                resFilePath = util.strRight(resFilePath, ":");
                resFilePath = util.strRight(resFilePath, '"');
                resFilePath = util.strLeft(resFilePath, '"');
                //console.error("업데이트  실패:", resFilePath);
            }
        }
    } catch (error) {
        console.error(error);
    }
};

// */X <= 'X'가 분
console.log(util.getTimeStamp() + ": start for client vs server Sync File...");
if (!config.wasSync.sync) {
    console.warn(
        "동기화 불가 상태롤 설정되어 작업을 취소합니다. config.json의 'wasSync.sync'를 확인하십시오."
    );
    return;
}
//STEP1: 내 파일들을 서버로 보내서 서버 파일을 업데이트 한다. ()
clientToServer();
updateFileFromServer();

//디렉터리 감시 시작...
var watchDirectory = __dirname;
if (IS_TEST) {
    watchDirectory = __dirname + path.sep + "tmp_client";
} else {
    watchDirectory = config.wasSync.syncDirectory;
    if (
        typeof watchDirectory == undefined ||
        typeof watchDirectory == "undefined" ||
        watchDirectory == null ||
        watchDirectory == ""
    ) {
        watchDirectory = __dirname;
    }
}

console.log("Watching Directory...:" + watchDirectory);
watch(watchDirectory, { recursive: true, delay: 100 }, function (evt, name) {
    var exptionFile = false;
    try {
        for (
            var index2 = 0;
            index2 < config.wasSync.syncExceptionFiles.length;
            index2++
        ) {
            var relPath = util.strRight(name, watchDirectory);
            var repRelPath = replaceAll(relPath, path.sep, "/");
            var exptionFilePath = config.wasSync.syncExceptionFiles[index2];
            if (repRelPath.indexOf(exptionFilePath) == 0) {
                exptionFile = true;
                break;
            }
        }
    } catch (error) {
        console.error(error);
    }
    if (exptionFile) {
        //비대상
    } else {
        //if (!fs.statSync(name).isDirectory()) {
        var fileObj = {};
        var base64 = "";
        var filePath = name;
        fileObj.path = filePath;
        var relPath = util.strRight(filePath, watchDirectory);
        var repRelPath = replaceAll(relPath, path.sep, "/");
        fileObj.relPath = repRelPath;
        fileObj.fileName = util.strRightBack(repRelPath, "/");
        fileObj.event = evt;

        var updateTarget = false;
        if (evt == "remove") {
            //폴더를 삭제하면?
            updateTarget = true;
        } else {
            if (fs.statSync(name).isDirectory()) {
                //폴더업데이트는 비대상
            } else {
                var stats = fs.statSync(filePath);
                //console.log(stats);
                var mtime = stats.mtimeMs; //최종수정일
                var size = stats.size; //크기
                if (size > 0) {
                    base64 = fs.readFileSync(fileObj.path, {
                        encoding: "base64",
                    });
                }

                fileObj.fileSize = size;
                fileObj.lastModified = mtime;
                updateTarget = true;
            }
        }

        if (updateTarget) {
            console.log(name, "==>", evt);
            var url = config.wasSync.syncServerAddr + "/sync/clientToServer";
            console.log(fileObj.path + " ==> " + url);
            var postData = {
                event: fileObj.event,
                filePath: fileObj.relPath,
                fileName: fileObj.fileName,
                fileSize: fileObj.fileSize,
                lastModified: fileObj.lastModified,
                base64: base64,
            };
            //console.log(postData);
            var ret = null;
            try {
                res = request("POST", url, { json: postData });
                var rslt = JSON.parse(res.getBody("utf8"));
                if (rslt.result) {
                    var serverFiles = rslt.description;
                    console.error(
                        "**********************************************업데이트 성공:",
                        serverFiles
                    );
                }
            } catch (error) {
                //console.error("*********", error.message);
                var rslt = error.message;
                if (rslt.indexOf('"result":true') != -1) {
                    var resFilePath = util.strRight(rslt, '"description"');
                    resFilePath = util.strRight(resFilePath, ":");
                    resFilePath = util.strRight(resFilePath, '"');
                    resFilePath = util.strLeft(resFilePath, '"');
                    console.error(
                        "**********************************************업데이트  성공:",
                        resFilePath
                    );
                } else {
                    var resFilePath = util.strRight(rslt, '"description"');
                    resFilePath = util.strRight(resFilePath, ":");
                    resFilePath = util.strRight(resFilePath, '"');
                    resFilePath = util.strLeft(resFilePath, '"');
                    //console.error("업데이트  실패:", resFilePath);
                }
            }
        }

        //}
    }
});

//일정시간마다 서버의 파일을 내 로컬로 업데이트
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
var updateFromServer = config.wasSync.updateFromServer.use;
if (
    typeof updateFromServer == "undefined" ||
    typeof updateFromServer == undefined ||
    updateFromServer == null
) {
    updateFromServer = false;
}
if (updateFromServer) {
    var masterTimer = 0;
    try {
        masterTimer = config.wasSync.updateFromServer.interval;
    } catch (e) {}
    console.log("config.scheduler.masterupdateinterval=" + masterTimer);
    if (
        typeof masterTimer == "undefined" ||
        typeof masterTimer == undefined ||
        masterTimer == null
    ) {
        masterTimer = 0;
    }
    if (masterTimer > 0) {
        const masterScheduler = schedule.scheduleJob(
            "*/" + masterTimer + " * * * *",
            function () {
                console.log(
                    util.getTimeStamp(),
                    ": 서버로부터 업데이트된 파일이 있는지 확인...(Interval:" + masterTimer + ")"
                );
                updateFileFromServer();
            }
        );
    }
}
