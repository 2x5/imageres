'use strict';
var AWS = require('aws-sdk');
var fs = require('fs');
var Promise = require('bluebird');

// AWS Configurations
AWS.config.loadFromPath('./config.json');

var s3 = new AWS.S3({params: {Bucket: 'imageres'}});

const download = (key) => {
    console.log('downloading %s', key);
    return Promise.resolve(
        s3.getObject({Key: key }, function (err, data) {
            if (err) {
                console.log(err, err.stack);
            } else {
                return data.Body;
            }
        })
    );
};

const upload = (filename) => {
    var file = new Buffer(fs.readFileSync(filename));
    var params = { Key: 'testS3-' + Date.now(), Body: file};

    console.log('uploading %s to bucket %s', filename, bucket);

    return Promise.resolve(
        s3.upload(params, function (err, data) {
            if (err) {
                console.error('error: ', err);
            } else {
                console.log('Successfully uploaded data');
                return true;
            }
        })
    );
};

exports.upload = upload;
exports.download = download;

if (process.argv[2]) {
    download(process.argv[2]);
}

