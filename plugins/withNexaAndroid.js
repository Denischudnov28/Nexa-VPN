const { withAppBuildGradle, withDangerousMod, createRunOncePlugin } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const WIREGUARD_VERSION = "1.0.20260102";

function withNexaAndroid(config) {
  config = withAppBuildGradle(config, (mod) => {
    let gradle = mod.modResults.contents;
    const dependency = \`implementation "com.wireguard.android:tunnel:\${WIREGUARD_VERSION}"\`;
    if (!gradle.includes("com.wireguard.android:tunnel:")) {
      const marker = /dependencies\s*\{/;
      if (!marker.test(gradle)) throw new Error("NEXA VPN: could not find app Gradle dependencies block.");
      gradle = gradle.replace(marker, (match) => \`\${match}\n    \${dependency}\`);
    }
    if (!gradle.includes("coreLibraryDesugaringEnabled")) {
      const compileOptions = /compileOptions\s*\{/;
      if (compileOptions.test(gradle)) {
        gradle = gradle.replace(compileOptions, (match) => \`\${match}\n        coreLibraryDesugaringEnabled true\`);
      } else {
        const androidBlock = /android\s*\{/;
        if (!androidBlock.test(gradle)) throw new Error("NEXA VPN: could not find Android Gradle block.");
        gradle = gradle.replace(androidBlock, (match) => \`\${match}\n    compileOptions {\n        sourceCompatibility JavaVersion.VERSION_17\n        targetCompatibility JavaVersion.VERSION_17\n        coreLibraryDesugaringEnabled true\n    }\`);
      }
    }
    if (!gradle.includes("desugar_jdk_libs:")) {
      gradle = gradle.replace(/dependencies\s*\{/, (match) => \`\${match}\n    coreLibraryDesugaring "com.android.tools:desugar_jdk_libs:2.1.5"\`);
    }
    mod.modResults.contents = gradle;
    return mod;
  });

  config = withDangerousMod(config, ["android", async (mod) => {
    const root = mod.modRequest.projectRoot;
    const sourceDir = path.join(root, "native", "android");
    const targetDir = path.join(root, "android", "app", "src", "main", "java", "app", "nexa", "vpn");
    fs.mkdirSync(targetDir, { recursive: true });
    for (const file of ["NexaWireGuardController.kt", "NexaVpnModule.kt"]) {
      const source = path.join(sourceDir, file);
      if (!fs.existsSync(source)) throw new Error(\`NEXA VPN: missing native source \${source}\`);
      fs.copyFileSync(source, path.join(targetDir, file));
    }
    return mod;
  }]);

  return config;
}

module.exports = createRunOncePlugin(withNexaAndroid, "with-nexa-android", "0.1.0");
