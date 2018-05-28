export function async getUserByEmail(email) {
  const scanParams = {
    TableName: 'contributors',
    FilterExpression: 'attribute_not_exists(deletedAt) and email = :email',
    ExpressionAttributeValues: {
      ':email' : email,
    },
  };
  const result = await DynamoDB.scan(scanParams);
  return (result.Count > 0) ? result.Items[0] : null;
}