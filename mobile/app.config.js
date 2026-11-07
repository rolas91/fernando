module.exports = ({ config }) => {
  let result = config;
  if (process.env.EAS_PROJECT_ID) {
    result = { ...result, extra: { ...result.extra, eas: { ...result.extra?.eas, projectId: process.env.EAS_PROJECT_ID } } };
  }
  if (process.env.GOOGLE_SERVICES_JSON) {
    result = { ...result, android: { ...result.android, googleServicesFile: process.env.GOOGLE_SERVICES_JSON } };
  }
  return result;
};
