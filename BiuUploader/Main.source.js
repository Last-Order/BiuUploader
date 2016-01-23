$(document).ready(() => {
    $.material.init();
    var md5 = (file) => {
        return new Promise((resolve, reject) => {
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
                    end = ((start + chunkSize) >= file.size) ? file.size : start + chunkSize;
                fileReader.readAsArrayBuffer(blobSlice.call(file, start, end));
            }
            console.time('MD5计算');
            loadNext();
        })
    }
    var loadMetaInfo = (file) => {
        return new Promise((resolve, reject) => {
            var object = new AV.Asset.fromFile(file);
            object.on('buffer', percent => {
                if (percent === 100){
                    console.timeEnd('获取信息用时');
                    resolve(); // 无论有没有读到信息 读到尾了都返回
                }
            });
            var info = {};
            var promises = ['metadata', 'format'].map((i) => {
                return new Promise((resolve, reject) => {
                    object.once(i, (data) => {
                        info[i] = data;
                        resolve();
                    });
                })
            });
            console.time('获取信息用时');
            Promise.all(promises).then(() => {
                console.timeEnd('获取信息用时');
                object.stop();
                loadedInfoPile.push(file);
                resolve(info);
            });
            object.start();
        })
    }
    var checkLoadInfoQueue = () => {
        if (loadInfoQueue.length > 0) {
            var file = loadInfoQueue.shift();
            console.log('Now Processing: ' + file.name);
            Promise.all([loadMetaInfo(file), md5(file)]).then((data) => {
                metaInfo[file.name] = data[0] || {};
                metaInfo[file.name].md5 = data[1];
                inputInfoQueue.push(file);
                console.log(metaInfo);
                checkLoadInfoQueue();
                checkInputQueue();
            })
        }
    }
    var checkInputQueue = () => {
        if (inputInfoQueue.length > 0 && !onInput) {
            var file = inputInfoQueue.shift();
            $('.music-info').fadeIn('fast', () => {
                onInput = true;
                $('#inputTitle').val(metaInfo[file.name].metadata && metaInfo[file.name].metadata.title || '');
                $('#inputArtist').val(metaInfo[file.name].metadata && metaInfo[file.name].metadata.artist || '');
                $('#inputAlbum').val(metaInfo[file.name].metadata && metaInfo[file.name].metadata.album || '');
                $('.music-info').data('file', file);
            });
        }
        else {
            if (!onInput) {
                $('.music-info').fadeOut('fast');
            }
        }
    }
    $('#info-save').click(() => {
        var file = $('.music-info').data('file');
        var title = $('#inputTitle').val();
        var artist = $('#inputArtist').val();
        var album = $('#inputAlbum').val();
        var desc = $('#inputDesc').val();
        $('.upload').append(
            $('<div>').addClass('list-group-item')
                .append(
                    $('<div>').addClass('row-content')
                        .append(
                            $('<h4>').addClass('list-group-item-heading').text(title)
                            )
                        .append(
                            $('<div>').addClass('progress')
                                .append(
                                    $('<div>').addClass('progress-bar').css('width', '0%')
                                    )
                            )
                    )
            );
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
    var checkUploadQueue = () => {
        if (onUpload) {
            return;
        }
        if (uploadQueue.length > 0) {
            var task = uploadQueue.shift();
            var uid = '118';
            var secretKey = 'MKpyJfHVEPFsSijBudOaboYLUWkpbwkW';
            var sign = SparkMD5.hash(`${uid}${metaInfo[task.file.name].md5}${task.title}${task.artist}${task.album}${task.desc}${secretKey}`);
            // 获取上传Token
            var data = {
                'uid': uid,
                'filemd5': metaInfo[task.file.name].md5,
                'title': task.title,
                'singer': task.artist,
                'album': task.album,
                'remark': task.desc,
                'sign': sign
                // 'force': '1'
            };
            $.ajax({
                type: 'POST',
                url: 'https://api.biu.moe/Api/createSong ',
                data: data,
                dataType: 'json',
                success: (data) => {
                    if (data.success === true) {
                        uploadFile(task.file, data.token, metaInfo[task.file.name].md5, task.DOM);
                    }
                    else if (data.success === false) {
                        if (data.error_code === 2) {
                            console.log('撞车');
                            checkUploadQueue();
                        }
                    }
                }
            })
        }
    }
    var uploadFile = (file, token, md5, DOM) => {
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
            xhr: function () {
                var customXHR = $.ajaxSettings.xhr();
                if (customXHR.upload) {
                    customXHR.upload.addEventListener('progress', (progress) => {
                        var percent = progress.loaded / progress.total;
                        progress_bar.css('width', percent * 100 + '%');
                    }, false);
                }
                return customXHR;
            },
            processData: false,
            contentType: false,
            beforeSend: () => {
                onUpload = true;
                title.css('color', '#2591AB');
            },
            success: (data) => {
                onUpload = false;
                title.css('color', '#4FAD4A');
                checkUploadQueue();
            },
            error: (e) => {
                console.log(e);
            }
        })
    }
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
})