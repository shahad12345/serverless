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
      // console.log(process.env.AFTER_TRAINEE_APPLIES_STATE_MACHINE_ARN);
      StepFunctions.startExecution({
        stateMachineArn: process.env.AFTER_TRAINEE_APPLIES_STATE_MACHINE_ARN,
        input: JSON.stringify({
            id: id,
        }),
      }, (error) => {
        console.log('error', error);
        return callback(null, makeResponse(204));
      })
    });
  });
};

const listContributors = (contributors) => {
    const scanParams = {
      TableName: 'contributors',
    };
    DynamoDB.scan(scanParams, (error, result) => {
      return contributors(result.Items);
    });
};

const findTraineeAppliesTemplateOrCreate = (done) => {
  var params = {
    Template: {
      TemplateName: 'TraineeApplies',
      SubjectPart: 'متقدّم جديد: {{traineeFullname}}!',
      HtmlPart: '<div style="direction: rtl">{{contributorFullname}}، السلام عليكم.<br /><br />هناك متقدّم جديد إلى التدريب بالتفاصيل التالية:<br /><br />الاسم الكامل: {{traineeFullname}}.<br />الجنس: {{gender}}.<br />البريد الإلكتروني: {{email}}.<br />رقم الجوّال: <span style="direction: ltr">{{mobile}}</span>.<br />اسم الجامعة: {{university}}.<br />التخصّص: {{major}}.<br />مكان الإقامة: {{place}}.<br />التاريخ المتوقّع للتخرّج: {{expectedGraduationDate}}.<br />رابط ڤيديو التعريف الذاتي: <a href="{{youtubeVideoUrl}}">{{youtubeVideoUrl}}</a>.<br />كيف عرف عنّا: {{howDidYouKnowAboutUs}}.<br /><br />للتصويت بقبول المتقدّم، تفضّل بزيارة هذا الرابط:<br /><a href="{{voteUpUrl}}">{{voteUpUrl}}</a><br /><br />أو للتصويت برفض المتقدّم، تفضّل بزيارة هذا الرابط:<br /><a href="{{voteDownUrl}}">{{voteDownUrl}}</a><br /><br />كلّ الحظّ النبيل.<br />مؤسّسة أنظمة غيمة (CloudSystems).</div>',
    },
  };
  SES.createTemplate(params, (error, data) => {
    return done(true);
  });
};

module.exports.notifyWhenTraineeApplies = (event, context, callback) => {
  listContributors((contributors) => {
    findTraineeAppliesTemplateOrCreate((done) => {
      // return SES.deleteTemplate({TemplateName: 'TraineeApplies'}, (error, data) => {
      //   console.log(error);
      //   console.log(data);
      // });
      getTraineeById(event.id, (trainee) => {
        if (!trainee) return callback(new Error('Trainee does not exist.'));
        var destinations = [];
        for (var i = contributors.length - 1; i >= 0; i--) {
          const voteUrl = `https://cloudsystems.sa/vote.html?accessToken=${contributors[0].accessToken}&traineeId=${trainee.id}`;
          destinations.push({
            Destination: {
              ToAddresses: [contributors[i].email],
            },
            ReplacementTemplateData: JSON.stringify({
              contributorFullname: contributors[i].fullname,
              voteUpUrl: `${voteUrl}&rating=up`,
              voteDownUrl: `${voteUrl}&rating=down`,
            }),
          });
        }
        var params = {
          Source: process.env.SENDER_EMAIL,
          Template: 'TraineeApplies',
          Destinations: destinations,
          DefaultTemplateData: JSON.stringify({
            traineeFullname: trainee.fullname,
            gender: trainee.gender,
            email: trainee.email,
            mobile: trainee.mobile,
            university: trainee.university,
            major: trainee.major,
            place: trainee.place,
            expectedGraduationDate: trainee.expectedGraduationDate,
            youtubeVideoUrl: trainee.youtubeVideoUrl,
            howDidYouKnowAboutUs: trainee.howDidYouKnowAboutUs,
          }),
        };
        SES.sendBulkTemplatedEmail(params, (error, data) => {
          console.log(error);
          if (error) return callback(new Error('Cannot send a bulk email.'));
          return callback(null, {id: event.id});
        });
      });
    });
  });
};

const calculateUpVotesPercentage = (upVotes, downVotes, contributors) => {
  let denominator = (contributors == 0) ? 1 : contributors;
  return (upVotes/denominator)*100;
};

module.exports.notifyWhenVotesCalculated = (event, context, callback) => {
  // console.log('notifyWhenVotesCalculated', event);
  getTraineeById(event.id, (trainee) => {
    if (!trainee) return callback(new Error('Trainee does not exist.'));

    const alreadyVotesCalculated = trainee.statuses.find((status) => {
      return status.event == 'votesCalculated';
    }) !== undefined;

    // Check if the votes already calculated.
    if (alreadyVotesCalculated) return callback(new Error('The votes are already calculated.'));

    listContributors((contributors) => {
      const timestamp = new Date().getTime();

      const upVotes = trainee.statuses.filter((status) => {
        return status.event == 'voteAdded' && status.rating == 'up';
      }).length;

      const downVotes = trainee.statuses.filter((status) => {
        return status.event == 'voteAdded' && status.rating == 'down';
      }).length;

      var statuses = [{
        event: 'votesCalculated',
        upVotes: upVotes,
        downVotes: downVotes,
        contributors: contributors.length,
        upVotesPercentage: calculateUpVotesPercentage(upVotes, downVotes, contributors.length),
        createdAt: timestamp,
      }];

      if (statuses[0].upVotesPercentage >= 60) {
        statuses.push({
          event: 'initiallyAccepted',
          createdAt: timestamp,
        });
      } else {
        statuses.push({
          event: 'initiallyRejected',
          createdAt: timestamp,
        });
      }

      const params = {
        TableName: 'trainees',
        Key: {
          id: trainee.id,
        },
        ExpressionAttributeValues: {
          ':status': statuses,
          ':updatedAt': timestamp,
        },
        UpdateExpression: 'SET statuses = list_append(statuses, :status), updatedAt = :updatedAt',
        ReturnValues: 'ALL_NEW',
      };

      var subject = 'تمّ قبولك في برنامج التدريب الصيفي!';
      var message = `<div style="direction: rtl">${trainee.fullname}، السلام عليكم.<br /><br />تمّ قبولك في برنامج التدريب الصيفي لمؤسّسة أنظمة غيمة (CloudSystems) لعام 2018. نرجو إكمال الإجراءات والنماذج التي تتطلّبها الجامعة ثمّ إرسال الوثائق ذات العلاقة لنا من خلال الردّ على هذه الرسالة.<br /><br />كلّ الحظّ النبيل.<br />مؤسّسة أنظمة غيمة (CloudSystems).</div>`;

      if (statuses[1].event == 'initiallyRejected') {
        subject = 'نعتذر عن قبولك في برنامج التدريب الصيفي';
        message = `<div style="direction: rtl">${trainee.fullname}، السلام عليكم.<br /><br />نعتذر عن قبولك في برنامج التدريب الصيفي لمؤسّسة أنظمة غيمة (CloudSystems) لعام 2018.<br /><br />كلّ الحظّ النبيل.<br />مؤسّسة أنظمة غيمة (CloudSystems).</div>`;
      }

      DynamoDB.update(params, (error, result) => {
        const emailParams = {
          Destination: {
            ToAddresses: [trainee.email]
          },
          Message: {
            Body: {
              Html: {
                Data: message,
                Charset: 'utf-8'
              }
            },
            Subject: {
              Data: subject,
              Charset: 'utf-8'
            }
          },
          Source: process.env.SENDER_EMAIL,
          ReplyToAddresses: [process.env.CONTACT_EMAIL]
        };
        SES.sendEmail(emailParams, (error, response) => {
          return callback(null, {id: event.id});
        });
      });
    });
  });
  // return callback(null, {id: event.id});
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
        return status.event == 'votesCalculated' || (status.event == 'voteAdded' && status.createdBy == contributor.id);
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
