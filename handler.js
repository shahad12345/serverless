'use strict';

const AWS = require('aws-sdk');

AWS.config.update({
  accessKeyId: process.env.SES_USER_ACCESS_KEY_ID,
  secretAccessKey: process.env.SES_USER_SECRET_ACCESS_KEY,
  region: process.env.SES_USER_REGION,
});

const ses = new AWS.SES();

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

  try {
    var body = JSON.parse(event.body);
  } catch (error) {
    var body = null;
  }

  const name = body ? body.name : null;
  const email = body ? body.email : null;
  const subject = body ? body.subject : null;
  const message = body ? body.message : null;

  if (!name || !email || !subject || !message) {
    return callback(null, makeResponse(400));
  }

  if (validateEmail(email) === false) {
    return callback(null, makeResponse(406));
  }

  const emailParams = {
    Destination: {
      ToAddresses: [process.env.CONTACT_EMAIL]
    },
    Message: {
      Body: {
        Text: {
          Data: `${name} <${email}>\n\n${message}`,
          Charset: 'utf-8'
        }
      },
      Subject: {
        Data: subject,
        Charset: 'utf-8'
      }
    },
    Source: process.env.CONTACT_EMAIL,
    ReplyToAddresses: [email]
  };

  ses.sendEmail(emailParams, function (error, response) {
    console.log('error', error);
    console.log('response', response);
    return callback(null, makeResponse(error ? 408 : 204));
  });
};
