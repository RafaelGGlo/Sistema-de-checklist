/** @type {import('expo/fingerprint').Config} */
module.exports = {
  // Generated native folders are ignored by Git (CNG). Ignore-only changes
  // should not invalidate an installed APK's runtime.
  sourceSkips: ['PackageJsonAndroidAndIosScriptsIfNotContainRun', 'GitIgnore'],
  // Kotlin creates temporary compiler-session files during Gradle builds.
  // They must not change the runtime relative to an update published by CI.
  ignorePaths: ['**/.kotlin/**/*'],
};
