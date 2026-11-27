const {
  withAppBuildGradle,
  withDangerousMod,
  withMainApplication,
} = require('expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');

const packageName = 'com.drtrafficcontrol.mobile';
const dependency = 'com.google.android.play:app-update:2.1.0';
const registration = `add(${packageName}.update.PlayUpdatePackage())`;

function insertAfter(contents, marker, insertion) {
  const updated = contents.replace(marker, (match) => `${match}\n${insertion}`);
  if (updated === contents) {
    throw new Error(`Play Update plugin could not insert ${insertion.trim()}`);
  }
  return updated;
}

module.exports = function withPlayUpdate(config) {
  config = withAppBuildGradle(config, (config) => {
    const gradle = config.modResults;
    if (!gradle.contents.includes('com.google.android.play:app-update:')) {
      gradle.contents = insertAfter(
        gradle.contents,
        /^dependencies\s*\{/m,
        `    implementation("${dependency}")`,
      );
    }
    return config;
  });

  config = withMainApplication(config, (config) => {
    const application = config.modResults;
    if (application.language !== 'kt') {
      throw new Error('Play Update requires a Kotlin MainApplication');
    }
    if (!application.contents.includes(registration)) {
      application.contents = insertAfter(
        application.contents,
        /PackageList\(this\)\.packages\.apply\s*\{/,
        `                ${registration}`,
      );
    }
    return config;
  });

  return withDangerousMod(config, [
    'android',
    async (config) => {
      const target = path.join(
        config.modRequest.platformProjectRoot,
        'app/src/main/java',
        ...packageName.split('.'),
        'update',
      );
      await fs.mkdir(target, { recursive: true });
      await fs.copyFile(
        path.join(__dirname, 'play-update', 'PlayUpdatePackage.kt'),
        path.join(target, 'PlayUpdatePackage.kt'),
      );
      return config;
    },
  ]);
};
