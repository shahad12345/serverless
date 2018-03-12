'use strict';

// const gmailSend = require('gmail-send');

module.exports.contactUs = (event, context, callback) => {
  const response = {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*', // Required for CORS support to work
    },
    body: JSON.stringify({
      message: 'Go Serverless v1.0! Your function executed successfully!',
      input: event,
    }),
  };

  var send = require('gmail-send')({
    user: process.env.EMAIL_USERNAME,
    pass: process.env.EMAIL_PASSWORD,
    to: 'hossamzee@gmail.com',
    subject: 'test subject',
    text: 'gmail-send example 1',         // Plain text
    //html:    '<b>html text</b>'            // HTML
  });

  send({}, function (err, res) {
    console.log('* [example 1.1] send() callback returned: err:', err, '; res:', res);
  });

  // console.log('send', send, typeof send);

  callback(null, response);
};
