'use strict';

const AuthenticationClient = require('auth0').AuthenticationClient;

// Libraries.
const uuid = require('uuid');
const AWS = require('aws-sdk');
const SES = new AWS.SES();
const DynamoDB = new AWS.DynamoDB.DocumentClient();
const StepFunctions = new AWS.StepFunctions();
const Lambda = new AWS.Lambda();
const auth0 = new AuthenticationClient({
  domain: process.env.AUTH0_DOMAIN,
  clientId: process.env.AUTH0_CLIENT_ID
});

// Constants.
const program = 'summer-2018';
const MAX_SEND_EMAILS = 50;

function makeResponse(statusCode, body) {
  return {
    statusCode: statusCode,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
    body: body ? JSON.stringify(body) : null,
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

function generateAccessToken() {
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
  var email = body ? body.email : null;
  const subject = body ? body.subject : null;
  const message = body ? body.message : null;

  if (!name || !email || !subject || !message) {
    return callback(null, makeResponse(400));
  }

  if (validateEmail(email) === false) {
    return callback(null, makeResponse(406));
  }

  // Normalize the email.
  email = email.toLowerCase();

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
  var email = body ? body.email : null;
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

  email = email.toLowerCase();

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
      StepFunctions.startExecution({
        stateMachineArn: process.env.AFTER_TRAINEE_APPLIES_STATE_MACHINE_ARN,
        input: JSON.stringify({
            id: id,
        }),
      }, (error) => {
        console.log('error', error);
        return callback(null, makeResponse(204));
      });
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

const listTrainees = (trainees) => {
    const scanParams = {
      TableName: 'trainees',
    };
    DynamoDB.scan(scanParams, (error, result) => {
      return trainees(result.Items);
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
          const voteUrl = `https://cloudsystems.sa/vote.html?accessToken=${contributors[i].accessToken}&traineeId=${trainee.id}`;
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
        votesDifference: (upVotes-downVotes),
        createdAt: timestamp,
      }];

      if (statuses[0].votesDifference > 0) {
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
          ':currentStatus': statuses[1].event,
          ':updatedAt': timestamp,
        },
        UpdateExpression: 'SET statuses = list_append(statuses, :status), currentStatus = :currentStatus, updatedAt = :updatedAt',
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
          ReplyToAddresses: [process.env.CONTACT_EMAIL],
          // CcAddresses: [process.env.CONTACT_EMAIL],
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

function accept(traineeId) {
  if (!traineeId) {
    throw new Error('ValidationError');
  }

  return getTraineeById(traineeId, (trainee) => {
    if (!trainee) throw new Error('NotFoundError');
    const alreadyAccepted = trainee.statuses.find((status) => {
      return status.event == 'accepted';
    }) !== undefined;

    // Check if the trainee already accepted.
    if (alreadyAccepted) throw new Error('ConflictError');

    const timestamp = new Date().getTime();
    const params = {
      TableName: 'trainees',
      Key: {
        id: trainee.id,
      },
      ExpressionAttributeValues: {
        ':status': [{
          event: 'accepted',
          createdAt: timestamp,
        }],
        ':currentStatus': 'accepted',
        ':updatedAt': timestamp,
      },
      UpdateExpression: 'SET statuses = list_append(statuses, :status), currentStatus = :currentStatus, updatedAt = :updatedAt',
      ReturnValues: 'ALL_NEW',
    };

    DynamoDB.update(params, (error, result) => {
      if (error) throw new Error('APIError');
      return true;
    });
  });
};

module.exports.accept = (event, context, callback) => {
  try {
    var body = JSON.parse(event.body);
  } catch (error) {
    var body = null;
  }

  const accessToken = body ? body.accessToken : null;
  const traineeId = body ? body.traineeId : null;

  if (!accessToken || !traineeId) {
    return callback(null, makeResponse(400));
  }

  getContributorByAccessToken(accessToken, (contributor) => {
    if (!contributor) return callback(null, makeResponse(401));
    return getTraineeById(traineeId, (trainee) => {
      if (!trainee) return callback(null, makeResponse(404));
      const alreadyAccepted = trainee.statuses.find((status) => {
        return status.event == 'accepted';
      }) !== undefined;

      // Check if the trainee already accepted.
      if (alreadyAccepted) return callback(null, makeResponse(409));

      const timestamp = new Date().getTime();
      const params = {
        TableName: 'trainees',
        Key: {
          id: trainee.id,
        },
        ExpressionAttributeValues: {
          ':status': [{
            event: 'accepted',
            createdAt: timestamp,
            createdBy: contributor.id,
          }],
          ':currentStatus': 'accepted',
          ':updatedAt': timestamp,
        },
        UpdateExpression: 'SET statuses = list_append(statuses, :status), currentStatus = :currentStatus, updatedAt = :updatedAt',
        ReturnValues: 'ALL_NEW',
      };

      DynamoDB.update(params, (error, result) => {
        return callback(null, makeResponse(error ? 408 : 204));
      });
    });
  });
};

module.exports.listTrainees = (event, context, callback) => {
  return listTrainees((trainees) => {
    return callback(null, makeResponse(200, trainees));
  });
};

module.exports.test = (event, context, callback) => {
  return listTrainees((trainees) => {
    var initiallyAccepted = trainees.filter((trainee) => {
      return trainee.currentStatus == 'initiallyAccepted';
    });
    for (var i = initiallyAccepted.length - 1; i >= 0; i--) {
      console.log('accepting', initiallyAccepted[i].fullname);
      accept(initiallyAccepted[i].id);
    }
  });
};

/**
  * Returns an IAM policy document for a given user and resource.
  *
  * @method buildIAMPolicy
  * @param {String} userId - user id
  * @param {String} effect  - Allow / Deny
  * @param {String} resource - resource ARN
  * @param {String} context - response context
  * @returns {Object} policyDocument
  */
const buildIAMPolicy = (userId, effect, resource, context) => {
  const policy = {
    principalId: userId,
    context,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: effect,
          Resource: resource,
        },
      ],
    },
    // context,
  };
  return policy;
};

  const getUserByEmail = (email, callback) => {
    const scanParams = {
      TableName: 'contributors',
      FilterExpression: 'attribute_not_exists(deletedAt) and email = :email',
      ExpressionAttributeValues: {
        ':email' : email,
      },
    };
    DynamoDB.scan(scanParams, (error, result) => {
      return (error || result.Count > 0) ? callback(result.Items[0]) : callback(null);
    });
  };

module.exports.auth = (event, context, callback) => {
  var accessToken = event.authorizationToken ? event.authorizationToken : null;
  if (accessToken) {
    accessToken = accessToken.replace('Bearer ', '');
  }
  if (!accessToken) {
    console.log('Unauthorized');
    return callback('Unauthorized');
  }
  console.log('accessToken', accessToken);
  const user = auth0.users.getInfo(accessToken, (error, user) => {
    if (error || user == 'Unauthorized') {
      console.log('Unauthorized2');
      return callback('Unauthorized');
    }
    getUserByEmail(user.email, (foundUser) => {
      if (!foundUser) {
        console.log('Unauthorized3');
        return callback('Unauthorized');
      }
      // const authorizerContext = { user: foundUser };
      const policy = buildIAMPolicy(user.sub, 'Allow', event.methodArn, foundUser);
      // console.log('foundUser');
      try {
        console.log(JSON.stringify(policy));
        callback(null, policy);
      } catch (e) {
        console.log('error', e);
      }
    });
  });
};

module.exports.private = (event, context, callback) => {
  console.log('event', event);
  console.log('private is called.');
  callback(null, makeResponse(200));
};

module.exports.sendEmailToAll = (event, context, callback) => {
  console.log('event', event);
  console.log('sendEmailToAll is called.');

  try {
    var body = JSON.parse(event.body);
  } catch (error) {
    var body = null;
  }

  const subject = body ? body.subject : null;
  const message = body ? body.message : null;
  var to = [];

  if (!subject || !message) {
    return callback(null, makeResponse(400));
  }

  listContributors((contributors) => {
    const contributorEmails = contributors.map((contributor) => {
      return contributor.email;
    });
    // console.log(contributorEmails.length);
    listTrainees((trainees) => {
        // console.log(trainees);
        const traineeEmails = trainees.reduce((filtered, trainee) => {
          if (trainee.currentStatus == 'accepted') {
            filtered.push(trainee.email);
          }
          return filtered;
        }, []);

        // TODO:
        to = contributorEmails;

        const params = {
          FunctionName: process.env.SEND_EMAIL_LAMBDA_ARN,
          InvocationType: 'RequestResponse',
          Payload: JSON.stringify({
            to: to,
            subject: subject,
            message: message,
          }),
        };

        Lambda.invoke(params, function(error, data) {
          console.log(error);
          return callback(null, makeResponse(error ? 408 : 204));
        });
    });
  });
};

module.exports.sendEmail = (event, context, callback) => {

  const to = event.to;
  const subject = event.subject;
  const message = event.message;
  const chunks = chunkArray(to, MAX_SEND_EMAILS);

  Promise.all(chunks.map((chunk) => {
    console.log('chunk', chunk);
    const emailParams = {
      Destination: {
        ToAddresses: chunk,
      },
      Message: {
        Body: {
          Text: {
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
    return SES.sendEmail(emailParams).promise();
  })).then((success) => {
    return callback(null, success);
  }).catch((error) => {
    return callback(error);
  });
}

function chunkArray(myArray, chunk_size){
    var index = 0;
    var arrayLength = myArray.length;
    var tempArray = [];
    
    for (index = 0; index < arrayLength; index += chunk_size) {
      var myChunk = myArray.slice(index, index+chunk_size);
      // Do something if you want with the group
      tempArray.push(myChunk);
    }
    return tempArray;
}
