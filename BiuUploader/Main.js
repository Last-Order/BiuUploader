'use strict';

$(document).ready(function () {
    $.material.init();
    var md5 = function md5(file) {
        return new Promise(function (resolve, reject) {
            //MD5计算
            var blobSlice = File.prototype.slice || File.prototype.mozSlice || File.prototype.webkitSlice;
            var chunkSize = 2097152;
            var chunks = Math.ceil(file.size / chunkSize);
            var currentChunk = 0;
            var spark = new SparkMD5.ArrayBuffer();
            var fileReader = new FileReader();
            fileReader.onload = function (e) {
                //console.log('读取文件块', currentChunk + 1, 'of', chunks);
                spark.append(e.target.result);
                currentChunk++;
                if (currentChunk < chunks) {
                    loadNext();
                } else {
                    console.timeEnd('MD5计算');
                    resolve(spark.end());
                }
            };
            fileReader.onerror = function () {
                console.warn('MD5计算出错');
            };
            function loadNext() {
                var start = currentChunk * chunkSize,
                    end = start + chunkSize >= file.size ? file.size : start + chunkSize;
                fileReader.readAsArrayBuffer(blobSlice.call(file, start, end));
            }
            console.time('MD5计算');
            loadNext();
        });
    };
    var loadMetaInfo = function loadMetaInfo(file) {
        return new Promise(function (resolve, reject) {
            var object = new AV.Asset.fromFile(file);
            var info = {};
            var promises = ['metadata', 'format'].map(function (i) {
                return new Promise(function (resolve, reject) {
                    object.once(i, function (data) {
                        info[i] = data;
                        resolve();
                    });
                });
            });
            console.time('获取信息用时');
            Promise.all(promises).then(function () {
                console.timeEnd('获取信息用时');
                object.stop();
                loadedInfoPile.push(file);
                resolve(info);
            });
            object.start();
        });
    };
    var checkLoadInfoQueue = function checkLoadInfoQueue() {
        if (loadInfoQueue.length > 0) {
            var file = loadInfoQueue.shift();
            console.log('Now Processing: ' + file.name);
            Promise.all([loadMetaInfo(file), md5(file)]).then(function (data) {
                data[0].md5 = data[1];
                metaInfo[file.name] = data[0];
                inputInfoQueue.push(file);
                console.log(metaInfo);
                checkLoadInfoQueue();
                checkInputQueue();
            });
        }
    };
    var checkInputQueue = function checkInputQueue() {
        if (inputInfoQueue.length > 0 && !onInput) {
            var file = inputInfoQueue.shift();
            $('.music-info').fadeIn('fast', function () {
                onInput = true;
                $('#inputTitle').val(metaInfo[file.name].metadata.title || '');
                $('#inputArtist').val(metaInfo[file.name].metadata.artist || '');
                $('#inputAlbum').val(metaInfo[file.name].metadata.album || '');
                $('.music-info').data('file', file);
            });
        } else {
            if (!onInput) {
                $('.music-info').fadeOut('fast');
            }
        }
    };
    $('#info-save').click(function () {
        var file = $('.music-info').data('file');
        var title = $('#inputTitle').val();
        var artist = $('#inputArtist').val();
        var album = $('#inputAlbum').val();
        var desc = $('#inputDesc').val();
        $('.upload').append($('<div>').addClass('list-group-item').append($('<div>').addClass('row-content').append($('<h4>').addClass('list-group-item-heading').text(title)).append($('<div>').addClass('progress').append($('<div>').addClass('progress-bar').css('width', '0%')))));
        uploadQueue.push({
            "file": file,
            "title": title,
            "artist": artist,
            "album": album,
            "desc": desc,
            "DOM": $('.list-group-item').last()
        });
        onInput = false;
        console.log(uploadQueue);
        checkInputQueue();
        checkUploadQueue();
    });
    var checkUploadQueue = function checkUploadQueue() {
        if (onUpload) {
            return;
        }
        if (uploadQueue.length > 0) {
            var task = uploadQueue.shift();
            var uid = 118;
            var secretKey = 'MKpyJfHVEPFsSijBudOaboYLUWkpbwkW';
            var sign = SparkMD5.hash('' + uid + metaInfo[task.file.name].md5 + task.title + task.artist + task.album + task.desc + secretKey);
            // 获取上传Token
            var data = {
                'uid': '118',
                'filemd5': metaInfo[task.file.name].md5,
                'title': task.title,
                'singer': task.artist,
                'album': task.album,
                'remark': task.desc,
                'sign': sign,
                'force': '1'
            };
            $.ajax({
                type: 'POST',
                url: 'https://api.biu.moe/Api/createSong ',
                data: data,
                dataType: 'json',
                success: function success(data) {
                    if (data.success === true) {
                        uploadFile(task.file, data.token, metaInfo[task.file.name].md5, task.DOM);
                    } else if (data.success === false) {
                        if (data.error_code === 2) {
                            console.log('撞车');
                        }
                    }
                }
            });
        }
    };
    var uploadFile = function uploadFile(file, token, md5, DOM) {
        var progress_bar = DOM.find('.progress-bar');
        var title = DOM.find('h4');
        //上传文件
        console.log('Now Uploading : ' + file.name);
        var formData = new FormData();
        formData.append('file', file);
        formData.append('key', md5);
        formData.append('x:md5', md5);
        formData.append('token', token);
        $.ajax({
            type: "POST",
            url: "http://upload.qiniu.com/",
            data: formData,
            xhr: function xhr() {
                var customXHR = $.ajaxSettings.xhr();
                if (customXHR.upload) {
                    customXHR.upload.addEventListener('progress', function (progress) {
                        var percent = progress.loaded / progress.total;
                        progress_bar.css('width', percent * 100 + '%');
                    }, false);
                }
                return customXHR;
            },
            processData: false,
            contentType: false,
            beforeSend: function beforeSend() {
                onUpload = true;
                title.css('color', '#2591AB');
            },
            success: function success(data) {
                onUpload = false;
                console.log(data);
                title.css('color', '#4FAD4A');
                checkUploadQueue();
            },
            error: function error(e) {
                console.log(e);
            }
        });
    };
    var loadInfoQueue = []; // 读取文件队列
    var loadedInfoPile = []; // 已读取的文件
    var inputInfoQueue = []; // 需要输入信息的文件队列
    var onInput = false; // 标记正在输入信息状态
    var onUpload = false; // 标记正在上传的状态
    var metaInfo = {}; // 已读取的文件的信息
    var uploadQueue = []; // 待上传的文件队列
    $(".file-select").change(function () {
        inputInfoQueue = []; // 重新选了文件当前待输入作废
        onInput = false;
        $('.music-info').fadeOut('fast');
        for (var file = 0; file < $(".file-select")[0].files.length; file++) {
            var fileList = $(".file-select")[0].files;
            loadInfoQueue.push(fileList[file]);
        }
        checkLoadInfoQueue();
    });
});
