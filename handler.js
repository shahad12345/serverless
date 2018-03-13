'use strict';

const gmailSend = require('gmail-send');

function makeResponse(statusCode) {
  return {
    statusCode: statusCode,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  };
}

// https://stackoverflow.com/questions/46155/how-to-validate-an-email-address-in-javascript
function validateEmail(email) {
    var re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(String(email).toLowerCase());
}

module.exports.contactUs = (event, context, callback) => {

  const name = event.queryStringParameters ? event.queryStringParameters.name : null;
  const email = event.queryStringParameters ? event.queryStringParameters.email : null;
  const subject = event.queryStringParameters ? event.queryStringParameters.subject : null;
  const message = event.queryStringParameters ? event.queryStringParameters.message : null;

  if (!name || !email || !subject || !message) {
    return callback(null, makeResponse(400));
  }

  if (validateEmail(email) === false) {
    return callback(null, makeResponse(406));
  }

  const send = gmailSend({
    user: process.env.EMAIL_USERNAME,
    pass: process.env.EMAIL_PASSWORD,
    to: process.env.CONTACT_EMAIL,
    subject: subject,
    text: `${name} <${email}>\n\n${message}`, // Or use html.
  });

  send({}, function (error, response) {
    return callback(null, makeResponse(error ? 408 : 204));
  });
};
