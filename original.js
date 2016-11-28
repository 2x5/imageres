// Lambda function that receives a JSON array containing:
// 1. The source S3 Bucket
// 2. List of image keys for resizing
// 3. List of sizes and size names to use

var async = require('async');
var AWS = require('aws-sdk');
var gm = require('gm')
    .subClass({ imageMagick: true }); // Enable ImageMagick integration.
var util = require('util');

// get reference to S3 client
var s3 = new AWS.S3();

exports.handler = function (event, context) {
    console.log('event object: ' + JSON.stringify(event.body));
    var jsonEvent = event.body;

    var srcBucket = jsonEvent.s3_bucket;
    var imageList = jsonEvent.image_list;
    var sizeConfigs = jsonEvent.size_configs;

    console.log('srcBucket: ' + srcBucket);
    console.log('imageList: ' + imageList);
    console.log('sizeConfigs: ' + sizeConfigs);

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

        async.waterfall([
            function download (next) {
                console.log('started processing the image - ' + srcKey);
                    // Download the image from S3 into a buffer.
                s3.getObject({
                    Bucket: srcBucket,
                    Key: srcKey
                },
                        next);
            },
            function orientation (response, next) {
                    // Fix orientation
                gm(response.Body).orientation(function (err, value) {
                    if (value === 'Undefined') {
                        console.log('image does not have any exif orientation data: ' + srcBucket + '/' + srcKey);
                        return;
                    } else {
                        console.log('auto orienting image with exif data', value);
                            // Transform the image buffer in memory.
                        this.autoOrient() // (width, height)
                                .toBuffer(imageType, function (err, buffer) {
                                    if (err) {
                                        next(err);
                                    } else {
                                        next(null, response, buffer);
                                    }
                                });
                    }
                });
            },
            function tranform (response, data, next) {
                async.map(sizeConfigs, resize, function (err, mapped) {
                    next(err, mapped);
                });

                function resize (config, callback) {
                    gm(response.Body)
                            .size(function (err, size) {
                                if (err) {
                                    next(err);
                                }
                                // console.log(util.inspect(config, false, null))

                                // Infer the scaling factor to avoid stretching the image unnaturally.
                                var scalingFactor = Math.min(
                                    config.width / size.width,
                                    config.height / size.height
                                );
                                var width = scalingFactor * size.width;
                                var height = scalingFactor * size.height;

                                this.resize(width, height)
                                    .quality(90)
                                    .toBuffer(imageType, function (err, buffer) {
                                        console.log('toBuffer');
                                        if (err) {
                                            console.error(err);
                                            callback(err);
                                        } else {
                                            var obj = config;
                                            obj.contentType = response.ContentType;
                                            obj.data = buffer;
                                            obj.dstKey = srcKey.substring(0, srcKey.lastIndexOf(".")) + '_' + config.size_name + srcKey.substring(srcKey.lastIndexOf("."));
                                            console.log("before upload: " + util.inspect(obj, false, null));
                                            callback(null, obj);
                                        }
                                    });
                            });
                }
            },
            function upload (items, next) {
                console.log('in putObject' + util.inspect(items, false, null));
                async.each(items,
                        function (item, callback) {
                            s3.putObject({
                                Bucket: srcBucket,
                                Key: item.dstKey,
                                Body: item.data,
                                ContentType: item.contentType
                            }, callback);
                        },
                        function (err) {
                            next(err);
                        });
            }
        ],
            function (err) {
                if (err) {
                    console.error(
                        'Unable to resize ' + srcBucket + '/' + srcKey +
                        ' due to an error: ' + err
                    );
                } else {
                    console.log(
                        'Successfully resized ' + srcBucket + '/' + srcKey
                    );
                }
            }
        );
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
