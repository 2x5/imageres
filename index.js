'use strict';
var AWS = require('aws-sdk');
var im = require('imagemagick');
var fs = require('fs');
var async = require('async');

// AWS Configurations
AWS.config.loadFromPath('./config.json');

// get reference to S3 client
var s3 = new AWS.S3();

// response object returned from the lambda function
var output = [];
var bucket = '';

const resize = (bucket, response, resize_option) => {
    console.log('Resize operation started for - ' + resize_option.dest_key);
    var filename = resize_option.dest_key.replace(/^.*[\\/]/, '');
    var resizedFile = "/tmp/" + filename;
    var resize_req = {width: resize_option.width, height: resize_option.height, srcData: response.Body, dstPath: resizedFile};

    try {
        im.resize(resize_req, (err, stdout, stderr) => {
            if (err) {
                throw err;
            } else {
                console.log('Resize operation completed successfully for - ' + resize_option.dest_key);
                var resized_image_content = new Buffer(fs.readFileSync(resizedFile));
                var put_params = {Bucket: bucket, Key: resize_option.dest_key, Body: resized_image_content, ContentType: response.ContentType};
            // Upload the resized file to S3
                s3.putObject(put_params, function (err) {
                    if (err) {
                        console.log('Failed to upload the file - ' + resize_option.dest_key);
                        console.log(err, err.stack);
                    } else {
                        console.log('Successfully uploaded the file - ' + resize_option.dest_key);
                        var result = {};
                        result.dest_key = resize_option.dest_key;
                        result.status = true;
                        output.push(result);

                  // Delete the created tmp file
                        try {
                            fs.unlinkSync(resizedFile);
                        } catch (err) {
                            console.log('Failed to unlink the temporary file - ' + resizedFile);
                        }

                        console.log('Done resizing for - ' + resize_option.dest_key);
                    }
                });
            }
        });
    } catch (err) {
        console.log('Resize operation failed:', err);
    }
};

exports.resize = resize;

const process_single_image = (single_image, callback) => {
    console.log('started processing the image - ' + single_image.src_key);
    var src_key = single_image.src_key;
    var get_params = {Bucket: bucket, Key: src_key};

    s3.getObject(get_params, function (err, response) {
        if (err) {
            console.log('Failed to download the file');
            console.log(err, err.stack);
        } else {
            console.log('Successfully downloaded the file - ' + src_key);

            async.forEach(single_image.resize_options, function (resize_option, resizeCallback) {
                console.log('Resize operation started for - ' + resize_option.dest_key);
                var filename = resize_option.dest_key.replace(/^.*[\\/]/, '');
                var resizedFile = "/tmp/" + filename;
                var resize_req = {width: resize_option.width, height: resize_option.height, srcData: response.Body, dstPath: resizedFile};

                try {
                    im.resize(resize_req, (err, stdout, stderr) => {
                        if (err) {
                            throw err;
                        } else {
                            console.log('Resize operation completed successfully for - ' + resize_option.dest_key);
                            var resized_image_content = new Buffer(fs.readFileSync(resizedFile));
                            var put_params = {Bucket: bucket, Key: resize_option.dest_key, Body: resized_image_content, ContentType: response.ContentType};
                     // Upload the resized file to S3
                            s3.putObject(put_params, function (err) {
                                if (err) {
                                    console.log('Failed to upload the file - ' + resize_option.dest_key);
                                    console.log(err, err.stack);
                                } else {
                                    console.log('Successfully uploaded the file - ' + resize_option.dest_key);
                                    var result = {};
                                    result.dest_key = resize_option.dest_key;
                                    result.status = true;
                                    output.push(result);

                           // Delete the created tmp file
                                    try {
                                        fs.unlinkSync(resizedFile);
                                    } catch (err) {
                                        console.log('Failed to unlink the temporary file - ' + resizedFile);
                                    }

                                    console.log('Done resizing for - ' + resize_option.dest_key);
                                    resizeCallback();
                                }
                            });
                        }
                    });
                } catch (err) {
                    console.log('Resize operation failed:', err);
                }
            }, function (err) {
                if (err) {
                    console.log('image resizing failed');
                } else {
                    console.log('image resizing completed for - ' + src_key);
                    callback();
                }
            });
        }
    });
};

exports.handler = function (event, context, callback) {
    console.log('entered handler function');
    bucket = event.bucket;

    async.forEach(event.image_list, process_single_image, function (err) {
        if (err) {
            console.log('image processing failed');
        } else {
            console.log('its done buddy!!');
            callback(null, output);
        }
    });
};
