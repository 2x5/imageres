// Lambda function that receives a JSON array containing:
// 1. The source S3 Bucket
// 2. List of image keys for resizing
// 3. List of sizes and size names to use

var testFile = require('./event.json');

var async = require('async');
var AWS = require('aws-sdk');
var gm = require('gm')
    .subClass({ imageMagick: true }); // Enable ImageMagick integration.
var util = require('util');

/*
 {
     "accessKeyId": "yourkey",
     "secretAccessKey": "yoursecret",
     "region": "us-east-1"
 }
 */
AWS.config.loadFromPath('./config.json');

// get reference to S3 client
var s3 = new AWS.S3();

exports.fixOrientation = fixOrientation = function (response, next) {
    // Fix orientation
    console.log('Orientation image size: %d', response.length);
    gm(response.Body).orientation(function (err, value) {
        if (err) {
            next(err);
        }
        if (typeof value === 'undefined') {
            next(null, response);
        } else {
            console.log('auto orienting image with exif data', value);
            // Transform the image buffer in memory.
            this.autoOrient() // (width, height)
                .toBuffer('jpeg', function (err, buffer) {
                    if (err) {
                        next(err);
                    }
                    return next(null, response, buffer);
                });
        }
    });
};

exports.fixOrientation2 = fixOrientation2 = function (data) {
    return new Promise(function (resolve, reject) {
        gm(data.Body)
        // .autoOrient()
            .toBuffer('jpeg', function (err, buffer) {
                if (err) {
                    reject(err);
                }
                console.log('buffer.length => ' + buffer.length);
                resolve(buffer);
            });
    });
};

exports.resize = resize = function resize (params, data) {
    // console.log("resizing: %s => %s", config.Key, config.size_name);

    var config = Object.assign({}, params);

    return new Promise(function (resolve, reject) {
        gm(data.Body)
            .size(function (err, size) {
                if (err) {
                    reject(err);
                }
                // Infer the scaling factor to avoid stretching the image unnaturally.
                var scalingFactor = Math.min(
                    config.width / size.width,
                    config.height / size.height
                );
                var width = scalingFactor * size.width;
                var height = scalingFactor * size.height;

                var srcKey = config.Key;

                this.resize(width, height)
                    .quality(90)
                    .toBuffer(config.imageType, function (err, buffer) {
                        if (err) {
                            console.error(err);
                            reject(err);
                        } else {
                            var result = {};
                            result.contentType = data.ContentType;
                            result.data = buffer;
                            result.dstKey = srcKey.substring(0, srcKey.lastIndexOf(".")) + '_' + config.size_name + srcKey.substring(srcKey.lastIndexOf("."));
                            console.log("before upload: %s => %s", srcKey, result.dstKey);
                            resolve(result);
                        }
                    });
            });
    });
};

exports.uploadFile = uploadFile = function (file) {
    var putObjectPromise = s3.putObject(file).promise();
    putObjectPromise.then(console.log);
};

exports.handler = function (event, context) {
    console.log('event object: ' + JSON.stringify(event.body));
    var jsonEvent = event.body;

    var srcBucket = jsonEvent.s3_bucket;
    var imageList = jsonEvent.image_list;
    var sizeConfigs = jsonEvent.size_configs;

    console.log('srcBucket: ' + srcBucket);
    console.log('imageList: ' + JSON.stringify(imageList, null, 4));
    console.log('sizeConfigs: ' + JSON.stringify(sizeConfigs, null, 4));

    // Download the image from S3, fix orientation, resize, and upload as new file names.

    function processImage (image, callback) {
        var srcKey = image.src_key;

        // Infer the image type.
        var typeMatch = srcKey.match(/\.([^.]*)$/);
        if (!typeMatch) {
            console.error('unable to infer image type for key ' + srcKey);
            return;
        }
        var validImageTypes = ['png', 'jpg', 'jpeg', 'gif'];
        var imageType = typeMatch[1];
        if (validImageTypes.indexOf(imageType.toLowerCase()) < 0) {
            console.log('skipping non-image ' + srcKey);
            return;
        }

        var params = {Bucket: srcBucket, Key: srcKey};

        s3.getObject(params).promise()
            // .then(fixOrientation2)
            .then(function (response) {
                var resizeList = [];
                sizeConfigs.forEach(function (size) {
                    var config = Object.assign(size, params);
                    config.imageType = imageType;
                    resizeList.push(resize(config, response));
                });
                Promise.all(resizeList)
                    .then(function (fileList) {
                        var uploadList = [];
                        fileList.forEach(function (file) {
                            var upload = {
                                Bucket: params.Bucket,
                                Key: file.dstKey,
                                Body: file.data,
                                ContentType: file.contentType};

                            uploadList.push(uploadFile(upload));
                        });
                        return uploadList;
                    }).then(function (uploadList) {
                        Promise.all(uploadList);
                    });
            })
        ;
    }

    async.each(imageList, processImage, function (err) {
        var response = {};
        if (err) {
            response = {
                "body": JSON.stringify({ error: 'image processing failed!' }),
                "headers": {
                    "Content-Type": "application/json"
                },
                "statusCode": "500"
            };
            console.log('image processing failed');
            context.fail(response);
        } else {
            response = {
                "body": JSON.stringify({ error: 'image processing succeeded!' }),
                "headers": {
                    "Content-Type": "application/json"
                },
                "statusCode": "201"
            };
            console.log('image processing succeeded!!');
            context.succeed(response);
        }
    });
};

var mockContext = {
    fail: function (res) {
        console.dir('context.fail():\n' + res);
    },
    succeed: function (res) {
        console.dir('context.succeed():\n' + res);
    }

};
exports.handler(testFile, mockContext);
