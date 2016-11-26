'use strict';
var AWS = require('aws-sdk');
var fs  = require('fs');

// AWS Configurations
AWS.config.loadFromPath('./config.json');

var s3bucket = new AWS.S3({params: {Bucket: 'imageres'}});

const upload = (filename) => { 
    if (!filename) filename = process.argv[2];
    var file = new Buffer(fs.readFileSync(filename));
    console.log('  file size: ' + file.length);

    var testKey = 'testS3-' + Date.now();
        
    var params = { Key: testKey, Body: file};

    s3bucket.upload(params, function (err, data) {
        if (err) {
            console.log('error: ', err);
        } else {
            console.log('Successfully uploaded data');
        }
  });
};

exports.upload = upload;

if (process.argv[2]) {
    upload(process.argv[2]);       
}


