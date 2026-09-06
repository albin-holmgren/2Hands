const { withAppBuildGradle } = require("expo/config-plugins");

const MARKER = "// 2hands shared bundle inputs";
const CONFIG = `
${MARKER}
tasks.withType(com.facebook.react.tasks.BundleHermesCTask).configureEach {
    def workspaceRoot = rootProject.projectDir.toPath().resolve("../../..").normalize().toFile()
    inputs.files(fileTree(new File(workspaceRoot, "packages")) {
        include "*/src/**", "*/package.json"
        exclude "**/node_modules/**", "**/dist/**"
    }).withPropertyName("twohandsSharedSources")
        .withPathSensitivity(org.gradle.api.tasks.PathSensitivity.RELATIVE)
    inputs.file(new File(workspaceRoot, "pnpm-lock.yaml"))
        .withPropertyName("twohandsWorkspaceLockfile")
        .withPathSensitivity(org.gradle.api.tasks.PathSensitivity.RELATIVE)
    inputs.property("twohandsApiOrigin", providers.environmentVariable("EXPO_PUBLIC_API_URL").orElse(""))
}
`;

function addSharedBundleInputs(contents) {
  return contents.includes(MARKER) ? contents : `${contents.trimEnd()}\n${CONFIG}`;
}

/** Metro resolves workspace sources outside the app; Gradle must track them too. */
function withSharedBundleInputs(config) {
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== "groovy") {
      throw new Error("2hands shared bundle inputs require the generated Groovy app build file.");
    }
    mod.modResults.contents = addSharedBundleInputs(mod.modResults.contents);
    return mod;
  });
}

module.exports = withSharedBundleInputs;
module.exports.addSharedBundleInputs = addSharedBundleInputs;
