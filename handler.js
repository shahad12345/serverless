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

// TODO: The callback should be like (error, success).
const listGroups = (groups) => {
  const scanParams = {
    TableName: 'groups',
  };
  DynamoDB.scan(scanParams, (error, result) => {
    return groups(result.Items);
  });
};

const listAssignees = (assignees) => {
  const scanParams = {
    TableName: 'trainees',
    FilterExpression: 'attribute_not_exists(deletedAt) and currentStatus = :currentStatus',
    // FilterExpression: 'attribute_not_exists(deletedAt) and contains(email, :email)',
    ExpressionAttributeValues: {
      // ':email' : 'yopmail.com',
      ':currentStatus': 'accepted',
    },
  };
  DynamoDB.scan(scanParams, (error, result) => {
    return assignees(result.Items);
  });
};

const getMentors = (emails, mentors) => {
  var emailObject = {};
  var index = 0;
  console.log('emails', emails);
  emails.forEach(function(value) {
      index++;
      var emailKey = ":emailvalue"+index;
      emailObject[emailKey.toString()] = value;
  });

  const scanParams = {
    TableName: 'contributors',
    FilterExpression : 'email IN (' + Object.keys(emailObject).toString() + ')',
    ExpressionAttributeValues : emailObject,
  };
  DynamoDB.scan(scanParams, (error, result) => {
    console.log(error);
    return mentors(result.Items);
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

const getIndividualTaskById = (id, callback) => {
    const scanParams = {
      TableName: 'individualTasks',
      KeyConditionExpression: 'id = :id',
      ExpressionAttributeValues: {
        ':id': id,
      },
    };
    DynamoDB.query(scanParams, (error, result) => {
      console.log('getIndividualTaskById error', error);
      return (error || result.Count == 0) ? callback(null) : callback(result.Items[0]);
    });
};

module.exports.notifyWhenIndividualTaskCreated = (event, context, callback) => {
  const id = event.id;
  console.log('notifyWhenIndividualTaskCreated', id);
  console.log('notifyWhenIndividualTaskCreated event', event);
  console.log('notifyWhenIndividualTaskCreated context', context);
  getIndividualTaskById(id, (individualTask) => {
    if (!individualTask) {
      console.log('TASK_CANNOT_BE_FOUND');
      return callback('TASK_CANNOT_BE_FOUND');
    }
    var subject = `مهمّة فرديّة جديدة: ${individualTask.title}!`;
    var feedback = (!individualTask.feedback || individualTask.feedback == '') ? '' : `${individualTask.feedback}<br /><br />`;
    var references = '';

    if (individualTask.references.length == 0) {
      references = '';
    } else {
      references = 'المراجع:<br />';
      for (var i = 0; i < individualTask.references.length; i++) {
        references += `<br />- ${individualTask.references[i].title} (<a href="${individualTask.references[i].url}">${individualTask.references[i].url}</a>).`;
      }
      references += '<br /><br />';
    }

    var message = `<div style="direction: rtl"><br />${individualTask.assignedTo.fullname}، السلام عليكم.<br /><br />${feedback}مهمّة فرديّة جديدة بانتظار إبداعاتِك ويجب تسليمها قبل مرور ${individualTask.expiresAfter} ساعة من الآن. ${individualTask.description}<br /><br />${references}في حال رغبت بتسليم المهمّة، تفضّل بزيارة الرابط:<br /><a href="https://cloudsystems.sa/deliver-individual-task?id=${individualTask.id}">https://cloudsystems.sa/deliver-individual-task?id=${individualTask.id}</a><br /><br />وفي حال احتجت لمساعدةٍ فلا تتوانى بالبحث عنها في قناة المسار ${individualTask.channel} في تطبيق Slack.<br /><br />كلّ الحظّ النبيل.<br />مؤسّسة أنظمة غيمة (Cloud Systems).<br /><br /></div>`;

    // Send the message.
    const emailParams = {
      Destination: {
        ToAddresses: [individualTask.assignedTo.email]
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
      console.log('error sending email', error);
      const timestamp = new Date().getTime();
      const params = {
        TableName: 'individualTasks',
        Key: {
          id: id,
        },
        ExpressionAttributeValues: {
          ':status': [{
            event: 'sent',
            createdAt: timestamp,
          }],
          ':updatedAt': timestamp,
          ':currentStatus': 'sent',
        },
        UpdateExpression: 'SET statuses = list_append(statuses, :status), currentStatus = :currentStatus, updatedAt = :updatedAt',
        ReturnValues: 'ALL_NEW',
      };

      DynamoDB.update(params, (error, result) => {
        console.log('error when updating db', error);
        return callback(null, {
          id: id,
          expiresAfterInSeconds: individualTask.expiresAfter*60*60,
        });
      });
    });
  });
}

module.exports.notifyWhenIndividualTaskExpired = (event, context, callback) => {
  const id = event.id;
  getIndividualTaskById(id, (individualTask) => {
    // Check if the task is not delivered.
    if (individualTask.currentStatus != 'sent') return callback('TASK_HAS_NOT_EXPIRED');
    const assignedToSubject = `انتهت فترة تسليم المهمّة الفرديّة: ${individualTask.title}!`;
    const assignedToMessage = `<div style="direction: rtl"><br />${individualTask.assignedTo.fullname}، السلام عليكم.<br /><br />يؤسفنا إبلاغك بانتهاء فترة تسليم المهمّة الفرديّة: ${individualTask.title}؛ إذ لم تصل إلينا إجابتك على الرغم من مرور ${individualTask.expiresAfter} ساعة من إسناد المهمّة إليك. نرجو منك فيما تبقّى من مهامٍ أن تجتهد أكثر وتبادر بالتسليم قبل انتهاء الوقت. هذه الرسالة هي للإخطار فقط ولا تتطلّب منك الرد عليها أو اتّخاذ أيّ إجراء.<br /><br />كلّ الحظّ النبيل.<br />مؤسّسة أنظمة غيمة (Cloud Systems).<br /><br /><div style="color: #666">${individualTask.id}</div></div>`;

    // Send the message.
    const emailParams = {
      Destination: {
        ToAddresses: [individualTask.assignedTo.email]
      },
      Message: {
        Body: {
          Html: {
            Data: assignedToMessage,
            Charset: 'utf-8'
          }
        },
        Subject: {
          Data: assignedToSubject,
          Charset: 'utf-8'
        }
      },
      Source: process.env.SENDER_EMAIL,
      ReplyToAddresses: [process.env.CONTACT_EMAIL],
      // CcAddresses: [process.env.CONTACT_EMAIL],
    };
    SES.sendEmail(emailParams, (error, response) => {

      const timestamp = new Date().getTime();
      const params = {
        TableName: 'individualTasks',
        Key: {
          id: id,
        },
        ExpressionAttributeValues: {
          ':status': [{
            event: 'expired',
            createdAt: timestamp,
          }],
          ':updatedAt': timestamp,
          ':currentStatus': 'expired',
        },
        UpdateExpression: 'SET statuses = list_append(statuses, :status), currentStatus = :currentStatus, updatedAt = :updatedAt',
        ReturnValues: 'ALL_NEW',
      };

      DynamoDB.update(params, (error, result) => {
        return callback(null, {
          id: id,
        });
      });
      // callback(null, 'ASSIGNED_TO_NOTIFIED');
    });
    // TODO: FEAT: Notify the mentors.
  });
}

module.exports.deliverIndividualTask = (event, context, callback) => {
  const authorizer = event.requestContext.authorizer;
  console.log('deliverIndividualTask');
  console.log('authorizer', authorizer);

  try {
    var body = JSON.parse(event.body);
  } catch (error) {
    var body = null;
  }

  const id = body ? body.id : null;
  const timestamp = new Date().getTime();
  const answersString = body ? body.answers : null;

  if (!answersString || !id) {
    return callback(null, makeResponse(400));
  }

  // Make some variables.
  const answers = parseReferences(answersString);

  if (answers.length == 0) {
    console.log('answersString', answersString);
    console.log('answers', answers);
    return callback(null, makeResponse(400));
  }

  var answersHTML = '';
  const baseUrl = 'https://d2hbxkrooc.execute-api.eu-west-1.amazonaws.com/dev/answers';

  for (var i = 0; i < answers.length; i++) {
    answersHTML += `<br />- ${answers[i].title} (<a href="${baseUrl}?id=${id}&answer=${i}">${answers[i].url}</a>).`;
  }

  getIndividualTaskById(id, (individualTask) => {
    // Check if the task does not exist.
    if (!individualTask) {
      console.log('cannot find task', id);
      return callback(null, makeResponse(400));
    }

    // Check if the task is already delivered. 409
    if (individualTask.currentStatus == 'delivered' || individualTask.currentStatus == 'accepted' || individualTask.currentStatus == 'rejected') {
      return callback(null, makeResponse(409));
    }

    // Check if the user is not authorized. 403
    if (individualTask.assignedTo.id != authorizer.id) {
      console.log('403 individualTask.assignedTo.id', individualTask.assignedTo.id);
      return callback(null, makeResponse(403));
    }
    // Check if the task has expired.
    if (individualTask.currentStatus == 'expired') return callback(null, makeResponse(408));

    const acceptUrl = `https://cloudsystems.sa/correct-individual-task?id=${id}&action=accept`;
    const rejectUrl = `https://cloudsystems.sa/correct-individual-task?id=${id}&action=reject`;

    const params = {
      TableName: 'individualTasks',
      Key: {
        id: id,
      },
      ExpressionAttributeValues: {
        ':status': [{
          event: 'delivered',
          createdAt: timestamp,
        }],
        ':updatedAt': timestamp,
        ':currentStatus': 'delivered',
        ':answers': answers,
      },
      UpdateExpression: 'SET statuses = list_append(statuses, :status), currentStatus = :currentStatus, answers = :answers, updatedAt = :updatedAt',
      ReturnValues: 'ALL_NEW',
    };

    DynamoDB.update(params, (error, result) => {
      Promise.all(individualTask.mentors.map((mentor) => {
        const emailParams = {
          Destination: {
            // BccAddresses: chunk,
            ToAddresses: [mentor.email],
          },
          Message: {
            Body: {
              Html: {
                Data: `<div style="direction: rtl"><br />${mentor.fullname}، السلام عليكم.<br /><br />يسرّنا إبلاغك بأنّ ${individualTask.assignedTo.fullname} قد قام بتسليم المهمّة الفرديّة: ${individualTask.title}، وفي ما يلي الروابط التي زوّدنا بها:<br />${answersHTML}<br /><br />إذا كنت ترى بأنّ تنفيذ المهمّة كان على أكمل وجهٍ، فانقر على الرابط التالي لقبولها:<br />${acceptUrl}<br /><br />وإذا كنت ترى بأنّ تنفيذ المهمّة لم يكن بالشكل المطلوب، فانقر على الرابط التالي لرفضها:<br />${rejectUrl}<br /><br />كلّ الحظّ النبيل.<br />مؤسّسة أنظمة غيمة (Cloud Systems).<br /><br /></div>`,
                Charset: 'utf-8'
              }
            },
            Subject: {
              Data: `${individualTask.assignedTo.fullname} سلّم المهمّة الفرديّة: ${individualTask.title}!`,
              Charset: 'utf-8'
            }
          },
          Source: process.env.SENDER_EMAIL,
          ReplyToAddresses: [process.env.CONTACT_EMAIL]
        };
        return SES.sendEmail(emailParams).promise();
      })).then((success) => {
        callback(null, makeResponse(204));
      }).catch((error) => {
        console.log('error', error);
        callback(null, makeResponse(410));
      });
    });
  });
}

module.exports.correctIndividualTask = (event, context, callback) => {
  const authorizer = event.requestContext.authorizer;

  try {
    var body = JSON.parse(event.body);
  } catch (error) {
    var body = null;
  }

  const id = body ? body.id : null;
  const timestamp = new Date().getTime();
  var action = body ? body.action : null;

  if (!id || !action) {
    return callback(null, makeResponse(400));
  }

  action = (action == 'accept') ? 'accept' : 'reject';

  getIndividualTaskById(id, (individualTask) => {
    // Check if the task does not exist.
    if (!individualTask) return callback(null, makeResponse(400));
    // Check if the task is already corrected. 409
    if (individualTask.currentStatus == 'accepted' || individualTask.currentStatus == 'rejected') return callback(null, makeResponse(409));
    // Check if the user is not authorized (not among the mentors). 403
    // const mentorIds = individualTask.mentors.map((mentor) => {
    //   return mentor.id;
    // });
    // if (mentorIds.indexOf(authorizer.id) < 0) return callback(null, makeResponse(403));
    // Check if the task has expired.
    if (individualTask.currentStatus == 'expired') return callback(null, makeResponse(408));
    if (individualTask.currentStatus != 'delivered') return callback(null, makeResponse(406));

    const params = {
      TableName: 'individualTasks',
      Key: {
        id: id,
      },
      ExpressionAttributeValues: {
        ':status': [{
          event: `${action}ed`,
          createdAt: timestamp,
          createdBy: authorizer.id,
        }],
        ':updatedAt': timestamp,
        ':currentStatus': `${action}ed`,
      },
      UpdateExpression: 'SET statuses = list_append(statuses, :status), currentStatus = :currentStatus, updatedAt = :updatedAt',
      ReturnValues: 'ALL_NEW',
    };

    var subject = (action == 'accept') ? `رائع! تم قبول إجابتك للمهمّة الفرديّة: ${individualTask.title}!` : `لم يتم قبول إجابتك للمهمّة الفرديّة: ${individualTask.title}!`;
    var message = (action == 'accept') ? `<div style="direction: rtl"><br />${individualTask.assignedTo.fullname}، السلام عليكم.<br /><br />يسرّنا إبلاغك بأنّه تم قبول إجابتك للمهمّة الفرديّة: ${individualTask.title}؛ وبذلك تحصل على مهارة ${individualTask.skill}! استمر!<br /><br />مؤسّسة أنظمة غيمة (Cloud Systems).<br /><br /></div>` : `<div style="direction: rtl"><br />${individualTask.assignedTo.fullname}، السلام عليكم.<br /><br />يؤسفنا إبلاغك بأنّه لم يتم قبول إجابتك للمهمّة: ${individualTask.title}؛ وبذلك لا تحصل على مهارة ${individualTask.skill}. لا بأس، استمر بالمحاولة.<br /><br />مؤسّسة أنظمة غيمة (Cloud Systems).<br /><br /></div>`;

    DynamoDB.update(params, (error, result) => {
      const emailParams = {
        Destination: {
          ToAddresses: [individualTask.assignedTo.email],
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
      return SES.sendEmail(emailParams).promise().then((success) => {
        if (action == 'reject') {
          return callback(null, makeResponse(204));
        }

        // Add the skill to the trainee.
        const timestamp = new Date().getTime();
        const params = {
          TableName: 'trainees',
          Key: {
            id: individualTask.assignedTo.id,
          },
          ExpressionAttributeValues: {
            ':empty_list': [],
            ':skill': [individualTask.skill],
            ':updatedAt': timestamp,
          },
          UpdateExpression: 'SET skills = list_append(if_not_exists(skills, :empty_list), :skill), updatedAt = :updatedAt',
          ReturnValues: 'ALL_NEW',
        };

        DynamoDB.update(params, (error, result) => {
          console.log('error', error);
          if (error) return callback(null, makeResponse(410));
          return callback(null, makeResponse(204));
        });
      });
    });
  });
}

const getGroupTaskById = (id, callback) => {
    const scanParams = {
      TableName: 'groupTasks',
      KeyConditionExpression: 'id = :id',
      ExpressionAttributeValues: {
        ':id': id,
      },
    };
    DynamoDB.query(scanParams, (error, result) => {
      console.log('getGroupTaskById error', error);
      return (error || result.Count == 0) ? callback(null) : callback(result.Items[0]);
    });
};

const notifyWhenGroupTaskCreated = (id, callback) => {

  getGroupTaskById(id, (groupTask) => {
    if (!groupTask) {
      return callback('TASK_CANNOT_BE_FOUND');
    }
    var subject = `مهمّة جماعيّة جديدة: ${groupTask.title}!`;
    var feedback = (!groupTask.feedback || groupTask.feedback == '') ? '' : `${groupTask.feedback}<br /><br />`;
    var references = '';

    if (groupTask.references.length == 0) {
      references = '';
    } else {
      references = 'المراجع:<br />';
      for (var i = 0; i < groupTask.references.length; i++) {
        references += `<br />- ${groupTask.references[i].title} (<a href="${groupTask.references[i].url}">${groupTask.references[i].url}</a>).`;
      }
      references += '<br /><br />';
    }

    const memberFullnames = groupTask.group.members.map((member) => {
      return member.fullname;
    }).join('، ');

    const memberEmails = groupTask.group.members.map((member) => {
      return member.email;
    });

    const leaderFullname = groupTask.group.members.filter((member) => {
      return member.role == 'leader';
    })[0].fullname;

    // وإذا كنت قائدًا للمجموعة وأحسست بأنّك لا تستطيع قيادة المجموعة، تفضّل بزيارة الرابط (بعد مرور ساعة من قراءة هذه الرسالة كحدٍ أقصى):<br /><a href="https://cloudsystems.sa/quit-group-task?id=${groupTask.id}">https://cloudsystems.sa/quit-group-task?id=${groupTask.id}</a><br /><br />

    var message = `<div style="direction: rtl"><br />أعضاء مجموعة ”${groupTask.group.name}“، السلام عليكم.<br /><br />${feedback}مهمّة جماعيّة جديدة بانتظار إبداعاتِ مجموعتكم ويجب تسليمها من قِبل قائد المجموعة قبل مرور ${groupTask.expiresAfter} ساعة من الآن. أعضاء مجموعة ”${groupTask.group.name}“ هم: ${memberFullnames}. سيكون قائد المجموعة لهذه المهمّة: ${leaderFullname}.<br /><br /> كقائدٍ للمجموعة يجب عليك التنسيق بينك وبين أعضاء المجموعة لفهم المتطلّبات، ومن ثمّ عليك تحديد الأدوار وتوزيع المهام، ومن ثمّ عليك متابعة سير المهام من خلال أيّ وسيلةٍ متاحةٍ، ولاحقًا عليكَ تسليم المهام التي تعاونتكم كمجموعةٍ عليها من خلال الرابط أسفل هذه الرسالة.<br /><br />${groupTask.description}<br /><br />${references}إذا كنت قائدًا للمجموعة ورغبت بتسليم المهمّة، تفضّل بزيارة الرابط:<br /><a href="https://cloudsystems.sa/deliver-group-task?id=${groupTask.id}">https://cloudsystems.sa/deliver-group-task?id=${groupTask.id}</a><br /><br />وفي حال احتجت لمساعدةٍ فلا تتوانى بالبحث عنها في القناة الخاصّة بمجموعتك ${groupTask.group.name} أو القناة العامّة للمسار ${groupTask.publicChannel} في تطبيق Slack.<br /><br />كلّ الحظّ النبيل.<br />مؤسّسة أنظمة غيمة (Cloud Systems).<br /><br /></div>`;

    // Send the message.
    const emailParams = {
      Destination: {
        ToAddresses: memberEmails,
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
    };
    SES.sendEmail(emailParams, (error, response) => {
      console.log('error sending email', error);
      if (error) return callback('CANNOT_SEND_EMAIL');
      const timestamp = new Date().getTime();
      const params = {
        TableName: 'groupTasks',
        Key: {
          id: id,
        },
        ExpressionAttributeValues: {
          ':status': [{
            event: 'sent',
            createdAt: timestamp,
          }],
          ':updatedAt': timestamp,
          ':currentStatus': 'sent',
        },
        UpdateExpression: 'SET statuses = list_append(statuses, :status), currentStatus = :currentStatus, updatedAt = :updatedAt',
        ReturnValues: 'ALL_NEW',
      };

      DynamoDB.update(params, (error, result) => {
        console.log('error when updating db', error);
        if (error) return callback('CANNOT_UPDATE_DATABASE');
        return callback(null, {
          id: id,
          expiresAfterInSeconds: groupTask.expiresAfter*60, // TODO: Convert to seconds: groupTask.expiresAfter*60*60.
        });
      });
    });
  });
};

const notifyWhenGroupTaskExpired = (id, callback) => {
  getGroupTaskById(id, (groupTask) => {
    if (!groupTask) {
      return callback('TASK_CANNOT_BE_FOUND');
    }
    // Check if the task is not delivered.
    if (groupTask.currentStatus != 'sent') return callback('TASK_HAS_NOT_EXPIRED');

    const subject = `انتهت فترة تسليم المهمّة الجماعيّة: ${groupTask.title}!`;
    const message = `<div style="direction: rtl"><br />أعضاء مجموعة ”${groupTask.group.name}“، السلام عليكم.<br /><br />يؤسفنا إبلاغكم بانتهاء فترة تسليم المهمّة الجماعيّة: ${groupTask.title}؛ إذ لم تصل إلينا إجابتكم على الرغم من مرور ${groupTask.expiresAfter} ساعة من إسناد المهمّة إليكم. نرجو منكم فيما تبقّى من مهامٍ أن تجتهدوا أكثر وتبادروا بالتسليم قبل انتهاء الوقت. هذه الرسالة هي للإخطار فقط ولا تتطلّب منك الرد عليها أو اتّخاذ أيّ إجراء.<br /><br />كلّ الحظّ النبيل.<br />مؤسّسة أنظمة غيمة (Cloud Systems).<br /><br /><div style="color: #666">${groupTask.id}</div></div>`;
    
    const memberEmails = groupTask.group.members.map((member) => {
      return member.email;
    });

    // Send the message.
    const emailParams = {
      Destination: {
        ToAddresses: memberEmails,
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

      const timestamp = new Date().getTime();
      const params = {
        TableName: 'groupTasks',
        Key: {
          id: id,
        },
        ExpressionAttributeValues: {
          ':status': [{
            event: 'expired',
            createdAt: timestamp,
          }],
          ':updatedAt': timestamp,
          ':currentStatus': 'expired',
        },
        UpdateExpression: 'SET statuses = list_append(statuses, :status), currentStatus = :currentStatus, updatedAt = :updatedAt',
        ReturnValues: 'ALL_NEW',
      };

      DynamoDB.update(params, (error, result) => {
        return callback(null, {
          id: id,
        });
      });
      // callback(null, 'ASSIGNED_TO_NOTIFIED');
    });
    // TODO: FEAT: Notify the mentors.
  });
};

const deliverGroupTask = (id, userId, answers, ratings, callback) => {

  if (answers.length == 0) {
    return callback('NO_ANSWERS_FOUND');
  }

  const timestamp = new Date().getTime();
  var answersHTML = '';

  for (var i = 0; i < answers.length; i++) {
    answersHTML += `<br />- ${answers[i].title} (<a href="${answers[i].url}">${answers[i].url}</a>).`;
  }

  getGroupTaskById(id, (groupTask) => {
    // Check if the task does not exist.
    if (!groupTask) {
      return callback('NO_TASKS_FOUND');
    }

    // Check if the task is already delivered. 409
    if (groupTask.currentStatus == 'delivered' || groupTask.currentStatus == 'accepted' || groupTask.currentStatus == 'rejected') {
      return callback('TASK_ALREADY_DELIVERED');
    }

    // Check if the user is not authorized. 403
    const leaderId = groupTask.group.members.filter((member) => {
      return member.role == 'leader';
    })[0].id;

    const leaderFullname = groupTask.group.members.filter((member) => {
      return member.role == 'leader';
    })[0].fullname;

    if (leaderId != userId) {
      return callback('TASK_IS_FORBIDDEN');
    }

    // Check if the task has expired.
    if (groupTask.currentStatus == 'expired') return callback('TASK_HAS_EXPIRED');
    if (!ratings || ratings.length == 0) return callback('INVALID_RATINGS');

    // TODO: Check if the ratings are valid.
    // const ratingIds = ratings.filter((r) => {
    //   return r.id != leaderId;
    // }).map((r) => {
    //   return r
    // });

    const correctUrl = `https://cloudsystems.sa/correct-group-task?id=${id}`;

    const params = {
      TableName: 'groupTasks',
      Key: {
        id: id,
      },
      ExpressionAttributeValues: {
        ':status': [{
          event: 'delivered',
          createdAt: timestamp,
        }],
        ':updatedAt': timestamp,
        ':currentStatus': 'delivered',
        ':answers': answers,
        ':ratings': ratings,
      },
      UpdateExpression: 'SET statuses = list_append(statuses, :status), currentStatus = :currentStatus, answers = :answers, ratings = :ratings, updatedAt = :updatedAt',
      ReturnValues: 'ALL_NEW',
    };

    DynamoDB.update(params, (error, result) => {
      Promise.all(groupTask.mentors.map((mentor) => {
        const emailParams = {
          Destination: {
            ToAddresses: [mentor.email],
          },
          Message: {
            Body: {
              Html: {
                Data: `<div style="direction: rtl"><br />${mentor.fullname}، السلام عليكم.<br /><br />يسرّنا إبلاغك بأنّ ${leaderFullname} (قائد مجموعة ”${groupTask.group.name}“) قد قام بتسليم المهمّة الجماعيّة: ${groupTask.title}، وفي ما يلي الروابط التي زوّدنا بها:<br />${answersHTML}<br /><br />لمراجعة تقييم المهارات الذي قام به قائد المجموعة وقبول الإجابة أو رفضها؛ انقر على الرابط التالي: <br />${correctUrl}<br /><br />كلّ الحظّ النبيل.<br />مؤسّسة أنظمة غيمة (Cloud Systems).<br /><br /></div>`,
                Charset: 'utf-8'
              }
            },
            Subject: {
              Data: `${leaderFullname} سلّم المهمّة الجماعيّة: ${groupTask.title}!`,
              Charset: 'utf-8'
            }
          },
          Source: process.env.SENDER_EMAIL,
          ReplyToAddresses: [process.env.CONTACT_EMAIL]
        };
        return SES.sendEmail(emailParams).promise();
      })).then((success) => {
        callback(null, true);
      }).catch((error) => {
        console.log('error', error);
        callback('GONE');
      });
    });
  });
};

const correctGroupTask = (id, userId, action, ratings, callback) => {

  const timestamp = new Date().getTime();

  var action = (action == 'accept') ? 'accept' : 'reject';

  getGroupTaskById(id, (groupTask) => {
    // Check if the task does not exist.
    if (!groupTask) return callback('TASK_CANNOT_BE_FOUND');

    // Check if the task is already corrected. 409
    if (groupTask.currentStatus == 'accepted' || groupTask.currentStatus == 'rejected') {
      return callback('TASK_ALREADY_CORRECTED');
    }

    const memberEmails = groupTask.group.members.map((member) => {
      return member.email;
    });

    // Check if the task has expired.
    if (groupTask.currentStatus == 'expired') return callback('TASK_HAS_EXPIRED');
    if (groupTask.currentStatus != 'delivered') return callback('TASK_CANNOT_BE_CORRECTED');

    const params = {
      TableName: 'groupTasks',
      Key: {
        id: id,
      },
      ExpressionAttributeValues: {
        ':status': [{
          event: `${action}ed`,
          createdAt: timestamp,
          createdBy: userId,
        }],
        ':updatedAt': timestamp,
        ':currentStatus': `${action}ed`,
      },
      UpdateExpression: 'SET statuses = list_append(statuses, :status), currentStatus = :currentStatus, updatedAt = :updatedAt',
      ReturnValues: 'ALL_NEW',
    };

    var subject = (action == 'accept') ? `رائع! تم قبول إجابتكم للمهمّة الجماعيّة: ${groupTask.title}!` : `لم يتم قبول إجابتكم للمهمّة الجماعيّة: ${groupTask.title}!`;
    var message = (action == 'accept') ? `<div style="direction: rtl"><br />أعضاء مجموعة ”${groupTask.group.name}“، السلام عليكم.<br /><br />يسرّنا إبلاغكم بأنّه تم قبول إجابتكم للمهمّة الجماعيّة: ${groupTask.title}؛ وسيحصل كلّ عضوٍ على المهاراتِ ذات العلاقة بما ساهم! استمروا!<br /><br />مؤسّسة أنظمة غيمة (Cloud Systems).<br /><br /></div>` : `<div style="direction: rtl"><br />أعضاء مجموعة ”${groupTask.group.name}“، السلام عليكم.<br /><br />يؤسفنا إبلاغكم بأنّه لم يتم قبول إجابتكم للمهمّة: ${groupTask.title}. لا بأس، استمروا بالمحاولة.<br /><br />مؤسّسة أنظمة غيمة (Cloud Systems).<br /><br /></div>`;

    DynamoDB.update(params, (error, result) => {
      const emailParams = {
        Destination: {
          ToAddresses: memberEmails,
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
      return SES.sendEmail(emailParams).promise().then((success) => {
        if (action == 'reject') {
          return callback(null, 'REJECTED');
        }
        Promise.all(ratings.map((rating) => {
          // Add the skill to the trainee.
          const params = {
            TableName: 'trainees',
            Key: {
              id: rating.id,
            },
            ExpressionAttributeValues: {
              ':empty_list': [],
              ':skill': rating.skills,
              ':updatedAt': timestamp,
            },
            UpdateExpression: 'SET skills = list_append(if_not_exists(skills, :empty_list), :skill), updatedAt = :updatedAt',
            ReturnValues: 'ALL_NEW',
          };
          return DynamoDB.update(params).promise();
        })).then((success) => {
          callback(null, 'ACCEPTED');
        }).catch((error) => {
          console.log('error', error);
          callback('CANNOT_UPDATE_DATABASE');
        });
      });
    });
  });
};

module.exports.notifyWhenGroupTaskCreated = (event, context, callback) => {
  const id = event.id;
  console.log('notifyWhenGroupTaskCreated', id);
  console.log('notifyWhenGroupTaskCreated event', event);
  console.log('notifyWhenGroupTaskCreated context', context);
  notifyWhenGroupTaskCreated(id, callback);
}

module.exports.notifyWhenGroupTaskExpired = (event, context, callback) => {
  const id = event.id;
  console.log('notifyWhenGroupTaskExpired', id);
  console.log('notifyWhenGroupTaskExpired event', event);
  console.log('notifyWhenGroupTaskExpired context', context);
  notifyWhenGroupTaskExpired(id, callback);
}

module.exports.deliverGroupTask = (event, context, callback) => {
  const authorizer = event.requestContext.authorizer;
  console.log('deliverGroupTask');
  console.log('authorizer', authorizer);

  try {
    var body = JSON.parse(event.body);
  } catch (error) {
    var body = null;
  }

  const id = body ? body.id : null;
  const answers = body ? body.answers : null;
  const ratings = body ? body.ratings : null;

  if (!answers || !id || !ratings || answers.length == 0 || ratings.length == 0) {
    return callback(null, makeResponse(400));
  }

  deliverGroupTask(id, authorizer.id, answers, ratings, (error, success) => {
    if (error) {
      if (error == 'NO_ANSWERS_FOUND' || error == 'NO_TASKS_FOUND' || error == 'INVALID_RATINGS') {
        return callback(null, makeResponse(400));
      }
      if (error == 'TASK_ALREADY_DELIVERED') return callback(null, makeResponse(409));
      if (error == 'TASK_IS_FORBIDDEN'); return callback(null, makeResponse(403));
      if (error == 'TASK_HAS_EXPIRED'); return callback(null, makeResponse(408));
      if (error == 'GONE'); return callback(null, makeResponse(410));
    }
    return callback(null, makeResponse(204));
  });
}

module.exports.correctGroupTask = (event, context, callback) => {
  const authorizer = event.requestContext.authorizer;
  console.log('correctGroupTask');
  console.log('authorizer', authorizer);

  try {
    var body = JSON.parse(event.body);
  } catch (error) {
    var body = null;
  }

  const id = body ? body.id : null;
  const action = body ? body.action : null;
  const ratings = body ? body.ratings : null;

  if (!id || !action || !ratings || ratings.length == 0) {
    return callback(null, makeResponse(400));
  }

  correctGroupTask(id, authorizer.id, action, ratings, (error, success) => {
    if (error) {
      if (error == 'TASK_CANNOT_BE_FOUND') {
        return callback(null, makeResponse(400));
      }
      if (error == 'TASK_ALREADY_CORRECTED') return callback(null, makeResponse(409));
      if (error == 'TASK_HAS_EXPIRED'); return callback(null, makeResponse(408));
      if (error == 'TASK_CANNOT_BE_CORRECTED'); return callback(null, makeResponse(406));
      if (error == 'CANNOT_UPDATE_DATABASE'); return callback(null, makeResponse(410));
    }
    return callback(null, makeResponse(204));
  });
}

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

module.exports.listIndividualTasks = (event, context, callback) => {
  return listIndividualTasks((individualTasks) => {
    return callback(null, makeResponse(200, individualTasks));
  });
};

// TODO:
// module.exports.test = (event, context, callback) => {
//   return listContributors((contributors) => {
//     for (var i = 0; i < contributors.length; i++) {
//       var contributor = contributors[i];
//       var trainee = contributor;
//       trainee.id = uuid.v4();
//       trainee.email = trainee.email.split('@')[0] + '@yopmail.com';
//       trainee.currentStatus = 'accepted';
//       const putParams = {
//         TableName: 'trainees',
//         Item: trainee,
//       };
//       DynamoDB.put(putParams, (error) => {
//         console.log('trainee', trainee);
//         console.log('error', error);
//         // return callback(error);
//       });
//     }
//   });
// };

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

const getTraineeByEmail = (email, callback) => {
  const scanParams = {
    TableName: 'trainees',
    FilterExpression: 'attribute_not_exists(deletedAt) and email = :email and currentStatus = :currentStatus',
    ExpressionAttributeValues: {
      ':email' : email,
      ':currentStatus': 'accepted',
    },
  };
  DynamoDB.scan(scanParams, (error, result) => {
    return (error || result.Count > 0) ? callback(result.Items[0]) : callback(null);
  });
};

const getContributorByEmail = (email, callback) => {
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

module.exports.authTrainee = (event, context, callback) => {
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
    // TODO: Check if the user is verified.
    // if (user.email_verified === false){
    //   console.log('EMAIL_NOT_VERIFIED');
    //   return callback('Unauthorized');
    // }
    
    // Check if the trainee is accepted.
    getTraineeByEmail(user.email, (foundUser) => {
      if (!foundUser) {
        console.log('Unauthorized3');
        return callback('Unauthorized');
      }
      if (foundUser.currentStatus != 'accepted') {
        console.log('TRAINEE_NOT_ACCEPTED');
        return callback('Unauthorized');
      }
      foundUser.picture = user.picture;
      delete foundUser.statuses;
      delete foundUser.skills;
      const policy = buildIAMPolicy(user.sub, 'Allow', '*', foundUser);
      try {
        console.log(JSON.stringify(policy));
        callback(null, policy);
      } catch (e) {
        console.log('error', e);
      }
    });
  });
};

module.exports.authContributor = (event, context, callback) => {
  console.log('authContributor', event);
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
    // TODO: Check if the user is verified.
    // if (user.email_verified === false){
    //   console.log('EMAIL_NOT_VERIFIED');
    //   return callback('Unauthorized');
    // }
    console.log(user);
    getContributorByEmail(user.email, (foundUser) => {
      if (!foundUser) {
        console.log('Unauthorized3');
        return callback('Unauthorized');
      }
      foundUser.picture = user.picture;
      delete foundUser.accessToken;
      const policy = buildIAMPolicy(user.sub, 'Allow', '*', foundUser);
      try {
        console.log(JSON.stringify(policy));
        callback(null, policy);
      } catch (e) {
        console.log('error', e);
        return callback('Unauthorized');
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
  const to = body ? body.to : null;

  if (!subject || !message || !to) {
    return callback(null, makeResponse(400));
  }

  console.log('to', to);

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

        var recipients = [];

        if (to.indexOf('contributors') > -1) {
          console.log('found contributors', contributorEmails);
          recipients = recipients.concat(contributorEmails);
        }

        if (to.indexOf('trainees') > -1) {
          console.log('found trainees', traineeEmails);
          recipients = recipients.concat(traineeEmails);
        }

        const params = {
          FunctionName: process.env.SEND_EMAIL_LAMBDA_ARN,
          InvocationType: 'RequestResponse',
          Payload: JSON.stringify({
            to: recipients,
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
        BccAddresses: chunk,
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
    return SES.sendEmail(emailParams).promise();
  })).then((success) => {
    return callback(null, success);
  }).catch((error) => {
    return callback(error);
  });
}

module.exports.createIndividualTask = (event, context, callback) => {

  const createdBy = event.requestContext.authorizer.id;

  try {
    var body = JSON.parse(event.body);
  } catch (error) {
    var body = null;
  }

  const timestamp = new Date().getTime();
  const title = body ? body.title : null;
  var feedback = body ? body.feedback : null;
  var description = body ? body.description : null;
  var mentorsString = body ? body.mentors : null;
  const skill = body ? body.skill : null;
  const referencesString = body ? body.references : null;
  const channel = body ? body.channel : null;
  const expiresAfter = body ? body.expiresAfter : null;

  if (!title || !description || !mentorsString || !skill || !channel || !expiresAfter) {
    return callback(null, makeResponse(400));
  }

  // Make some variables.
  mentorsString = mentorsString.toLowerCase();
  description = description.replace(/(?:\r\n|\r|\n)/g, '<br />');
  
  if (feedback) {
    feedback = feedback.replace(/(?:\r\n|\r|\n)/g, '<br />');
  }

  const mentorEmails = mentorsString.split(',').map(function(item) {
    return item.trim();
  });

  console.log('referencesString', referencesString);

  const references = parseReferences(referencesString);

  getMentors(mentorEmails, (mentors) => {
    if (mentors.length == 0) return callback(null, makeResponse(404)); // NO_MENTORS_FOUND
    listAssignees((trainees) => {
      if (trainees.length == 0) return callback(null, makeResponse(400)); // NO_TRAINEES_FOUND
      Promise.all(trainees.map((assignee) => {
        const id = uuid.v4();
        console.log('taskId', id);
        console.log('taskTitle', title);
        console.log('assignee', assignee);
        // TODO: Trainee should have only id, email, fullname.
        const trainee = {
          id: assignee.id,
          email: assignee.email,
          fullname: assignee.fullname,
        };
        const putParams = {
          TableName: 'individualTasks',
          Item: {
            id: id,
            title: title,
            description: description,
            mentors: mentors,
            skill: skill,
            references: references,
            channel: channel,
            expiresAfter: expiresAfter,
            assignedTo: trainee,
            statuses: [
              {
                event: 'created',
                createdAt: timestamp,
                createdBy: createdBy,
              }
            ],
            currentStatus: 'created',
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        };

        // Since it is optional.
        if (feedback && feedback != '') {
          putParams.Item.feedback = feedback;
        }

        console.log('params', putParams);
        return DynamoDB.put(putParams).promise().then((success) => {
          console.log(process.env.AFTER_INDIVIDUAL_TASK_CREATED_STATE_MACHINE_ARN);
          return StepFunctions.startExecution({
            stateMachineArn: process.env.AFTER_INDIVIDUAL_TASK_CREATED_STATE_MACHINE_ARN,
            input: JSON.stringify({
              id: id,
            }),
          }).promise();
        }).catch((error) => {
          console.log('error1', error);
          return error;
        });
      })).then((success) => {
        return callback(null, makeResponse(204));
      }).catch((error) => {
        console.log('error2', error);
        return callback(null, makeResponse(408, error));
      });
    });
  });
};

module.exports.authContributorInfo = (event, context, callback) => {
  return callback(null, makeResponse(200, event.requestContext.authorizer));
}

module.exports.authTraineeInfo = (event, context, callback) => {
  return callback(null, makeResponse(200, event.requestContext.authorizer));
}

module.exports.visitAnswer = (event, context, callback) => {
  const id = event.queryStringParameters ? event.queryStringParameters.id : null;
  const answer = event.queryStringParameters ? event.queryStringParameters.answer : null;

  if (!id || !answer) {
    return callback(null, makeResponse(400, 'VALIDATION FAILED'));
  }

  getIndividualTaskById(id, (individualTask) => {
    if (!individualTask) return callback(null, makeResponse(404, 'TASK NOT FOUND'));
    if (individualTask.currentStatus == 'accepted' || individualTask.currentStatus == 'rejected') {
      return callback(null, makeResponse(406, 'DONE ALREADY'));
    }
    try {
      const answerUrl = individualTask.answers[answer].url;
      return callback(null, {
        statusCode: 302,
        headers: {
          Location: answerUrl,
        },
        body: '',
      });
    } catch (e) {
      return callback(null, makeResponse(403, 'ANSWER NOT FOUND'));
    }
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

function parseReferences(references) {
  var regex = /\-\s(.*)\s\((.*)\)\./g;
  var list = [];
  var match = regex.exec(references);
  while (match != null) {
    list.push({
      title: match[1],
      url: match[2],
    });
    match = regex.exec(references);
  }
  return list;
}

module.exports.extendIndividualTask = (event, context, callback) => {
  const authorizer = event.requestContext.authorizer;

  try {
    var body = JSON.parse(event.body);
  } catch (error) {
    var body = null;
  }

  const id = body ? body.id : null;
  const timestamp = new Date().getTime();

  if (!id) {
    return callback(null, makeResponse(400));
  }

  getIndividualTaskById(id, (individualTask) => {
    // Check if the task does not exist.
    if (!individualTask) return callback(null, makeResponse(400));
    // Check if the task is already corrected. 409
    if (individualTask.currentStatus != 'expired') return callback(null, makeResponse(409));

    const params = {
      TableName: 'individualTasks',
      Key: {
        id: id,
      },
      ExpressionAttributeValues: {
        ':status': [{
          event: `extended`,
          createdAt: timestamp,
          createdBy: authorizer.id,
        }],
        ':updatedAt': timestamp,
        ':currentStatus': `sent`,
      },
      UpdateExpression: 'SET statuses = list_append(statuses, :status), currentStatus = :currentStatus, updatedAt = :updatedAt',
      ReturnValues: 'ALL_NEW',
    };

    const subject = `تمّ تمديد فترة الإجابة للمهمّة الفرديّة: ${individualTask.title}!`;
    const message = `<div style="direction: rtl"><br />${individualTask.assignedTo.fullname}، السلام عليكم.<br /><br />يسرّنا إبلاغك بتمديد فترة تسليم إجابة المهمّة الفرديّة: ${individualTask.title}؛ علمًا أنّ تسليم الإجابة يكون من ذات الرابط السابق.<br /><br />مؤسّسة أنظمة غيمة (Cloud Systems).<br /><br /><div style="color: #666">${individualTask.id}</div></div>`;

    DynamoDB.update(params, (error, result) => {
      const emailParams = {
        Destination: {
          ToAddresses: [individualTask.assignedTo.email],
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
      return SES.sendEmail(emailParams).promise().then((success) => {
        return callback(null, makeResponse(204));
      });
    });
  });
};

const listIndividualTasks = (individualTasks) => {
  console.log('listIndividualTasks');
  let tasks = [];
  const scanParams = {
    TableName: 'individualTasks',
  };
  function onScan(error, data) {
    console.log('onScan');
    if (error) {
      return console.log('error', error);
    }
    tasks = tasks.concat(data.Items);
    if (typeof data.LastEvaluatedKey != "undefined") {
      scanParams.ExclusiveStartKey = data.LastEvaluatedKey;
      DynamoDB.scan(scanParams, onScan);
    } else {
      individualTasks(tasks);
    }
  }
  DynamoDB.scan(scanParams, onScan);
};

const collectTraineesData = (callback) => {
  let data = [];
  console.log('collectTraineesData');
  listIndividualTasks((individualTasks) => {
    // console.log(individualTasks);
    listTrainees((trainees) => {
      trainees = trainees.filter((trainee) => {
        return trainee.currentStatus == 'accepted' /*&& trainee.email.indexOf('yopmail') < 0*/; // TODO:
      });
      for (var i = trainees.length - 1; i >= 0; i--) {
        const trainee = trainees[i];
        data.push({
          id: trainee.id,
          fullname: trainee.fullname,
          skills: trainee.skills,
          email: trainee.email,
          total: individualTasks.filter((task) => {
            return task.assignedTo.id == trainee.id;
          }).length,
          sent: individualTasks.filter((task) => {
            return task.assignedTo.id == trainee.id && task.currentStatus == 'sent';
          }).length,
          delivered: individualTasks.filter((task) => {
            return task.assignedTo.id == trainee.id && task.currentStatus == 'delivered';
          }).length,
          accepted: individualTasks.filter((task) => {
            return task.assignedTo.id == trainee.id && task.currentStatus == 'accepted';
          }).length,
          rejected: individualTasks.filter((task) => {
            return task.assignedTo.id == trainee.id && task.currentStatus == 'rejected';
          }).length,
          expired: individualTasks.filter((task) => {
            return task.assignedTo.id == trainee.id && task.currentStatus == 'expired';
          }).length,
        });
      }
      callback(data);
    });
  });
};

const kickOutTrainee = (id, callback) => {
  getTraineeById(id, (trainee) => {
    console.log(trainee);
    if (trainee.currentStatus == 'kickedOut') {
      return callback('ALREADY_KICKED_OUT');
    }
    const timestamp = new Date().getTime();
    const params = {
      TableName: 'trainees',
      Key: {
        id: trainee.id,
      },
      ExpressionAttributeValues: {
        ':status': [{
          event: 'kickedOut',
          createdAt: timestamp,
        }],
        ':currentStatus': 'kickedOut',
        ':updatedAt': timestamp,
      },
      UpdateExpression: 'SET statuses = list_append(statuses, :status), currentStatus = :currentStatus, updatedAt = :updatedAt',
      ReturnValues: 'ALL_NEW',
    };

    DynamoDB.update(params, (error, result) => {
      if (error) return;
      const subject = `تمّ استبعادك من البرنامج التدريبي!`;
      const message = `<div style="direction: rtl"><br />${trainee.fullname}، السلام عليكم.<br /><br />يؤسفنا إبلاغك باستبعادك من البرنامج التدريبي لعدم تفاعلك، نرجو أن نراك مجتهدًا في القادم من البرامج.<br /><br />مؤسّسة أنظمة غيمة (Cloud Systems).<br /><br /></div>`;
      const emailParams = {
        Destination: {
          ToAddresses: [trainee.email],
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
      SES.sendEmail(emailParams).promise().then((success) => {
        console.log(success);
        callback(null, success);
      });
    });
  });
};

const kickOutInactiveTrainees = () => {
  console.log('kickOutInactiveTrainees');
  collectTraineesData((data) => {
    for (var i = data.length - 1; i >= 0; i--) {
      if (data[i].expired >= 7 && data[i].email.indexOf('yopmail') < 0) {
        kickOutTrainee(data[i].id, (error, success) => {
          console.log('error', error);
          console.log('success', success);
        });
      }
    }
  });
};

const getBestGroup = (groups, membersCount) => {
  var leastScore = 999;
  var bestGroup = 0;
  for (var g=0; g<groups.length; g++) {
    var currentScore = 0;
    var currentMembersCount = groups[g].length;
    for (var m=0; m<groups[g].length; m++) {
      currentScore += groups[g][m].accepted;
    }
    console.log(g, currentScore);
    if (currentMembersCount < membersCount && currentScore < leastScore) {
      leastScore = currentScore;
      bestGroup = g;
    }
  }
  return bestGroup;
}

const groupifyTrainees = (callback) => {
  collectTraineesData((data) => {

    data = data.filter((item) => {
      return item.email.indexOf('yopmail') >= 0;
    });

    data = data.sort((a, b) => {
      return b.accepted - a.accepted;
    });

    let membersCount = 0;
    let groupsCount = 0;

    for (var z=3; z<=7; z++) {
      if (data.length % z == 0) {
        membersCount = z;
        groupsCount = data.length/z;
        break;
      }
    }

    console.log('membersCount', membersCount);
    console.log('groupsCount', groupsCount);

    let groups = [];

    if (membersCount == 0 || groupsCount == 0) {
      return callback('CANNOT_GROUPIFY_TRAINEES');
    }

    for (var i = 0; i < groupsCount; i++) {
      groups[i] = [];
    }

    for (var i = 0; i < data.length; i++) {
      var g = getBestGroup(groups, membersCount);
      groups[g].push({
        id: data[i].id,
        accepted: data[i].accepted,
        email: data[i].email,
        fullname: data[i].fullname,
      });
    }

    callback(groups);
  });
};

const stringifyDeliveredTasks = (callback) => {
  listIndividualTasks((tasks) => {
    tasks = tasks.filter((task) => {
      return task.currentStatus == 'delivered';
    });
    let message = `<html dir="rtl"><head><meta charset="UTF-8"></head><body>${tasks.length}\n\n`;
    for (var i = tasks.length - 1; i >= 0; i--) {
      const task = tasks[i];
      const acceptUrl = `https://cloudsystems.sa/correct-individual-task?id=${task.id}&action=accept`;
      const rejectUrl = `https://cloudsystems.sa/correct-individual-task?id=${task.id}&action=reject`;
      message += `🔵🔵🔵<br /><br />`;
      message += `😊 ${task.assignedTo.fullname}<br />`;
      message += `${task.channel}<br />`;
      message += `${task.title}<br />`;

      message += `الإجابات<br /><br />`;
      const baseUrl = 'https://d2hbxkrooc.execute-api.eu-west-1.amazonaws.com/dev/answers';
  
      for (var j = task.answers.length - 1; j >= 0; j--) {
        message += `${task.answers[j].title}<br />`;
        message += `<a href="${baseUrl}?id=${task.id}&answer=${j}">${task.answers[j].url}</a><br />`;
      }
      message += `<br />👍 <a href="${acceptUrl}">${acceptUrl}</a><br />`;
      message += `👎 <a href="${rejectUrl}">${rejectUrl}</a><br />`;
      message += `<br /><br />`;
    }
    message += '</body></html>';
    callback(message);
  });
}

const addMentorToIndividualTasksBasedOnSkill = (email, skill, callback) => {
  getContributorByEmail(email, (mentor) => {
    if (!mentor) return callback('MENTOR_CANNOT_BE_FOUND');
    listIndividualTasks((tasks) => {
      tasks = tasks.filter((task) => {
        return task.currentStatus == 'sent' && task.skill == skill;
      });
      if (tasks.length === 0) return callback('NO_TASKS_FOUND');
      for (var i = tasks.length - 1; i >= 0; i--) {
        const task = tasks[i];
        const isEmailAmongMentors = task.mentors.filter((m) => {
          return m.email == email;
        }).length > 0;
        console.log(email, isEmailAmongMentors, skill);
        if (isEmailAmongMentors) continue;
          const timestamp = new Date().getTime();
          const params = {
            TableName: 'individualTasks',
            Key: {
              id: task.id,
            },
            ExpressionAttributeValues: {
              ':mentor': [mentor],
              ':updatedAt': timestamp,
            },
            UpdateExpression: 'SET mentors = list_append(mentors, :mentor), updatedAt = :updatedAt',
            ReturnValues: 'ALL_NEW',
          };
          DynamoDB.update(params, (error, success) => {
            console.log('error', error);
            console.log('success', success);
          });
          // TODO: Promise.all() and then callback.
      }
    });
  });
};

const createGroup = (name, members, callback) => {

  const id = uuid.v4();
  const timestamp = new Date().getTime();

  // Set the first member to be a leader.
  for (var i=0; i<members.length; i++) {
    members[i]['role'] = (i == 0) ? 'leader' : 'member';
  }

  const params = {
      TableName: 'groups',
      Item: {
        id: id,
        name: name,
        members: members,
        statuses: [
          {
            event: 'created',
            createdAt: timestamp,
          }
        ],
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    };

    console.log(params);

    DynamoDB.put(params, (error) => {
      return callback(error);
    });
}

// kickOutInactiveTrainees();
// groupifyTrainees((groups) => {
//   for (var g=0; g<groups.length; g++) {
//     var name = String.fromCharCode(65 + g);
//     createGroup(name, groups[g], (callback) => {
//       console.log(callback);
//     });
//   }
// });

module.exports.stringifyDeliveredTasks = (event, context, callback) => {
  stringifyDeliveredTasks((message) => {
    console.log(message);
    callback(null, {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'text/html',
      },
      body: message,
    });
  });
};

// groupTasks
//   id
//   groupId
//   assignees [{
//     role: 'leader',
//     id: '1234567890987654321',
//     email: 'helloworld@helloworld.com',
//   }],
//   ratings [{
//     id: '1234567890987654321',
//     email: 'helloworld@helloworld.com',
//     skills: [TEAM_LEADERSHIP],
//   }]
//   title
//   description
//   references:
//     [
//       title:
//       url:
//     ],
//   mentors
//   skills [
//     HELLO_WORLD,
//   ]
//   references
//   publicChannel
//   privateChannel
//   expiresAfter
//   statuses
//   currentStatus
//   answers
//   createdAt
//   updatedAt

const createGroupTasks = (createdById, title, feedback, description, references, mentorEmails, skills, publicChannel, expiresAfter, callback) => {

  const id = uuid.v4();
  description = description.replace(/(?:\r\n|\r|\n)/g, '<br />');

  if (feedback) {
    feedback = feedback.replace(/(?:\r\n|\r|\n)/g, '<br />');
  }

  getMentors(mentorEmails, (mentors) => {
    if (mentors.length == 0) return callback('NO_MENTORS_FOUND');
    listGroups((groups) => {
      if (groups.length == 0) return callback('NO_GROUPS_FOUND');
      
        Promise.all(groups.map((group) => {
          const id = uuid.v4();
          const timestamp = new Date().getTime();
          console.log('taskId', id);
          console.log('taskTitle', title);
          console.log('groups', group);
          const params = {
            TableName: 'groupTasks',
            Item: {
              id: id,
              groupId: group.id,
              group: group,
              title: title,
              description: description,
              mentors: mentors,
              skills: skills,
              references: references,
              publicChannel: publicChannel,
              privateChannel: group.name,
              expiresAfter: expiresAfter,
              statuses: [
                {
                  event: 'created',
                  createdAt: timestamp,
                  createdBy: createdById,
                }
              ],
              currentStatus: 'created',
              createdAt: timestamp,
              updatedAt: timestamp,
            },
          };

          // Since it is optional.
          if (feedback && feedback != '') {
            params.Item.feedback = feedback;
          }

          console.log('params', params);
          return DynamoDB.put(params).promise().then((success) => {
            console.log(process.env.AFTER_GROUP_TASK_CREATED_STATE_MACHINE_ARN);
            return StepFunctions.startExecution({
              stateMachineArn: process.env.AFTER_GROUP_TASK_CREATED_STATE_MACHINE_ARN,
              input: JSON.stringify({
                id: id,
              }),
            }).promise();
            // return true;
          }).catch((error) => {
            console.log('error1', error);
            return error;
          });
        })).then((success) => {
          return callback(null, success);
        }).catch((error) => {
          return callback(error);
        });
    });
  });

  // TODO: Validate mentors.
  // TODO: Validate groups.
  // TODO: Create group task.
  // TODO: Calculate expiry.
  // TODO: Update group leader.
}

module.exports.createGroupTasks = (event, context, callback) => {

  const createdById = event.requestContext.authorizer.id;

  try {
    var body = JSON.parse(event.body);
  } catch (error) {
    var body = null;
  }

  const title = body ? body.title : null;
  var feedback = body ? body.feedback : null;
  var description = body ? body.description : null;
  var mentorEmails = body ? body.mentorEmails : null;
  const skills = body ? body.skills : null;
  const references = body ? body.references : null;
  const publicChannel = body ? body.publicChannel : null;
  const expiresAfter = body ? body.expiresAfter : null;

  if (!title || !description || !mentorEmails || !skills || !publicChannel || !expiresAfter) {
    return callback(null, makeResponse(400));
  }

  // Make some variables.
  mentorEmails = mentorEmails.map(function(item) {
    return item.toLowerCase();
  });

  // return callback(null, makeResponse(404));
  // return callback(null, makeResponse(400));
  // callback(null, makeResponse(204));
  // return callback(makeResponse(408, error));

  createGroupTasks(
    createdById, title, feedback, description, references, mentorEmails, skills, publicChannel, expiresAfter,
    (error, success) => {
      if (error) callback(null, makeResponse(408));
      callback(null, makeResponse(201));
    }
  );
};
