'use strict';

// Libraries.
const uuid = require('uuid');
const AWS = require('aws-sdk');
const SES = new AWS.SES();
const DynamoDB = new AWS.DynamoDB.DocumentClient();
const StepFunctions = new AWS.StepFunctions();

// Constants.
const program = 'summer-2018';

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

function validateMobile(mobile) {
  var re = /^\+\d+$/;
  return re.test(mobile);
}

function validateDate(date) {
  var re = /^\d{4}\-\d{2}-\d{2}$/;
  return re.test(date);
}

function validateYoutubeVideoUrl(youtubeVideoUrl) {
  var re = /^http(s)?:\/\/(www\.)?youtu(be\.com|.be)\/.+$/;
  return re.test(youtubeVideoUrl);
}

function generatingAccessToken() {
  var text = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (var i = 0; i < 96; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
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
    Source: process.env.SENDER_EMAIL,
    ReplyToAddresses: [email]
  };

  SES.sendEmail(emailParams, (error, response) => {
    console.log('error', error);
    console.log('response', response);
    return callback(null, makeResponse(error ? 408 : 204));
  });
};

// trainees
//   id
//   fullname
//   gender
//   email
//   mobile
//   university
//   major
//   place
//   expectedGraduationDate
//   youtubeVideoUrl
//   howDidYouKnowAboutUs
//   statuses
//     applied, when
//     voteAdded <- 
//     votesCalculated
//     initiallyAccepted, when, whome
//     initiallyRejected, when, whome
//     waitingForDocuments
//     providedDocuments, documents
//     accepted
//     rejected
//     droppedOut
//     kickedOut
//     completed
//     passed
//     candidated

// contributors
//   id
//   accessToken
//   fullname
//   gender
//   email
//   mobile
//   place
//   createdAt
//   updatedAt

module.exports.apply = (event, context, callback) => {

  try {
    var body = JSON.parse(event.body);
  } catch (error) {
    var body = null;
  }

  const id = uuid.v4();
  const timestamp = new Date().getTime();
  const fullname = body ? body.fullname : null;
  var gender = body ? body.gender : null;
  const email = body ? body.email : null;
  const mobile = body ? body.mobile : null;
  const university = body ? body.university : null;
  const major = body ? body.major : null;
  const place = body ? body.place : null;
  const expectedGraduationDate = body ? body.expectedGraduationDate : null;
  const youtubeVideoUrl = body ? body.youtubeVideoUrl : null;
  const howDidYouKnowAboutUs = body ? body.howDidYouKnowAboutUs : null;

  if (!fullname || !gender || !email || !mobile || !university || !major || !place || !expectedGraduationDate || !youtubeVideoUrl || !howDidYouKnowAboutUs) {
    return callback(null, makeResponse(400));
  }

  // Validate email, mobile, expectedGraduationDate, and youtubeVideoUrl.
  if (validateEmail(email) === false || validateMobile(mobile) == false || validateDate(expectedGraduationDate) == false || validateYoutubeVideoUrl(youtubeVideoUrl) == false) {
    return callback(null, makeResponse(406));
  }

  const checkIfTraineeAlreadyExists = (callback) => {
    const scanParams = {
      TableName: 'trainees',
      FilterExpression: 'attribute_not_exists(deletedAt) and program = :program and (email = :email or mobile = :mobile)',
      ExpressionAttributeValues: {
        ':program': program,
        ':email' : email,
        ':mobile' : mobile,
      },
    };
    DynamoDB.scan(scanParams, (error, result) => {
      return (error || result.Count > 0) ? callback(true) : callback(false);
    });
  };

  const addTrainee = (callback) => {
    gender = (gender == 'male') ? 'male' : 'female';
    const putParams = {
      TableName: 'trainees',
      Item: {
        id: id,
        program: program,
        fullname: fullname,
        gender: gender,
        email: email,
        mobile: mobile,
        university: university,
        major: major,
        place: place,
        expectedGraduationDate: expectedGraduationDate,
        youtubeVideoUrl: youtubeVideoUrl,
        howDidYouKnowAboutUs: howDidYouKnowAboutUs,
        statuses: [
          {
            event: 'applied',
            createdAt: timestamp,
          }
        ],
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    };
    DynamoDB.put(putParams, (error) => {
      return callback(error);
    });
  };

  // Check if the trainee is already there.
  checkIfTraineeAlreadyExists((exists) => {
    if (exists) return callback(null, makeResponse(409));
    addTrainee((cannotAdd) => {
      if (cannotAdd) return callback(null, makeResponse(408));
      console.log(process.env.AFTER_TRAINEE_APPLIES_STATE_MACHINE_ARN);
      StepFunctions.startExecution({
        stateMachineArn: process.env.AFTER_TRAINEE_APPLIES_STATE_MACHINE_ARN,
        input: JSON.stringify({
            id: id,
        }),
      }, (error) => {
        return callback(null, makeResponse(204));
      })
    });
  });
};

// const checkIfContributorCanAccess = null;

module.exports.notifyWhenTraineeApplies = (event, context, callback) => {
  console.log('notifyWhenTraineeApplies.', event);
  return callback(null, {id: event.id});
};

module.exports.notifyWhenVotesCalculated = (event, context, callback) => {
  console.log('notifyWhenVotesCalculated', event);
  return callback(null, {id: event.id});
};

const getContributorByAccessToken = (accessToken, callback) => {
    const scanParams = {
      TableName: 'contributors',
      FilterExpression: 'accessToken = :accessToken',
      ExpressionAttributeValues: {
        ':accessToken': accessToken,
      },
    };
    DynamoDB.scan(scanParams, (error, result) => {
      return (error || result.Count == 0) ? callback(null) : callback(result.Items[0]);
    });
};

const getTraineeById = (id, callback) => {
    const scanParams = {
      TableName: 'trainees',
      FilterExpression: 'id = :id',
      ExpressionAttributeValues: {
        ':id': id,
      },
    };
    DynamoDB.scan(scanParams, (error, result) => {
      return (error || result.Count == 0) ? callback(null) : callback(result.Items[0]);
    });
};

module.exports.vote = (event, context, callback) => {
  try {
    var body = JSON.parse(event.body);
  } catch (error) {
    var body = null;
  }

  const accessToken = body ? body.accessToken : null;
  const traineeId = body ? body.traineeId : null;
  let rating = body ? body.rating : null;

  if (!accessToken || !traineeId || !rating) {
    return callback(null, makeResponse(400));
  }

  rating = (rating == 'up') ? 'up' : 'down';

  getContributorByAccessToken(accessToken, (contributor) => {
    if (!contributor) return callback(null, makeResponse(401));
    return getTraineeById(traineeId, (trainee) => {
      if (!trainee) return callback(null, makeResponse(404));
      
      const alreadyVoted = trainee.statuses.find((status) => {
        return status.event == 'voteAdded' && status.createdBy == contributor.id
      }) !== undefined;

      // Check if the contributor already voted.
      if (alreadyVoted) return callback(null, makeResponse(409));

      const timestamp = new Date().getTime();
      const params = {
        TableName: 'trainees',
        Key: {
          id: trainee.id,
        },
        ExpressionAttributeValues: {
          ':status': [{
            event: 'voteAdded',
            rating: rating,
            createdAt: timestamp,
            createdBy: contributor.id,
          }],
          ':updatedAt': timestamp,
        },
        UpdateExpression: 'SET statuses = list_append(statuses, :status), updatedAt = :updatedAt',
        ReturnValues: 'ALL_NEW',
      };

      DynamoDB.update(params, (error, result) => {
        return callback(null, makeResponse(error ? 408 : 204));
      });
    });
  });
};
