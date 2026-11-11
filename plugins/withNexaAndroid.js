const {
  withAppBuildGradle,
  withDangerousMod,
  withMainApplication,
  createRunOncePlugin,
} = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const WIREGUARD_VERSION = "1.0.20260102";

function withNexaAndroid(config) {
  config = withAppBuildGradle(config, (mod) => {
    let gradle = mod.modResults.contents;
    const dependency = `implementation "com.wireguard.android:tunnel:${WIREGUARD_VERSION}"`;
    if (!gradle.includes("com.wireguard.android:tunnel:")) {
      const dependencies = /dependencies\s*\{/;
      if (!dependencies.test(gradle)) throw new Error("NEXA VPN: app Gradle dependencies block not found.");
      gradle = gradle.replace(dependencies, (match) => `${match}\n    ${dependency}`);
    }

    if (!gradle.includes("coreLibraryDesugaringEnabled")) {
      const compileOptions = /compileOptions\s*\{/;
      if (compileOptions.test(gradle)) {
        gradle = gradle.replace(compileOptions, (match) => `${match}\n        coreLibraryDesugaringEnabled true`);
      } else {
        const android = /android\s*\{/;
        if (!android.test(gradle)) throw new Error("NEXA VPN: Android Gradle block not found.");
        gradle = gradle.replace(android, (match) =>
          `${match}\n    compileOptions {\n        sourceCompatibility JavaVersion.VERSION_17\n        targetCompatibility JavaVersion.VERSION_17\n        coreLibraryDesugaringEnabled true\n    }`);
      }
    }
    if (!gradle.includes("desugar_jdk_libs:")) {
      gradle = gradle.replace(/dependencies\s*\{/, (match) =>
        `${match}\n    coreLibraryDesugaring "com.android.tools:desugar_jdk_libs:2.1.5"`);
    }
    mod.modResults.contents = gradle;
    return mod;
  });

  config = withMainApplication(config, (mod) => {
    let source = mod.modResults.contents;
    if (!source.includes("NexaVpnPackage()")) {
      const packageList = /(PackageList\(this\)\.packages\.apply\s*\{)/;
      if (!packageList.test(source)) {
        throw new Error("NEXA VPN: unsupported MainApplication.kt structure; register NexaVpnPackage manually.");
      }
      source = source.replace(packageList, "$1\n              add(NexaVpnPackage())");
      if (!source.includes("import app.nexa.vpn.NexaVpnPackage")) {
        source = source.replace(/^(package [^\n]+\n)/m, "$1\nimport app.nexa.vpn.NexaVpnPackage\n");
      }
    }
    mod.modResults.contents = source;
    return mod;
  });

  config = withDangerousMod(config, ["android", async (mod) => {
    const root = mod.modRequest.projectRoot;
    const sourceDir = path.join(root, "native", "android");
    const targetDir = path.join(root, "android", "app", "src", "main", "java", "app", "nexa", "vpn");
    fs.mkdirSync(targetDir, { recursive: true });
    for (const file of ["NexaWireGuardController.kt", "NexaVpnModule.kt"]) {
      const source = path.join(sourceDir, file);
      if (!fs.existsSync(source)) throw new Error(`NEXA VPN: missing native source ${source}`);
      fs.copyFileSync(source, path.join(targetDir, file));
    }
    return mod;
  }]);

  return config;
}

module.exports = createRunOncePlugin(withNexaAndroid, "with-nexa-android", "0.2.0");
