// Learn more https://docs.expo.dev/guides/customizing-metro
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, '../../packages/shared');
const sharedEntry = path.join(sharedRoot, 'src/index.ts');

const config = getDefaultConfig(projectRoot);

// `@salonstaff/shared` lives outside this (standalone, non-workspace) project.
config.watchFolders = [...(config.watchFolders ?? []), sharedRoot];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];

const upstreamResolve = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = upstreamResolve ?? context.resolveRequest;

  if (moduleName === '@salonstaff/shared') {
    return { type: 'sourceFile', filePath: sharedEntry };
  }

  // Bare imports from the shared package (e.g. `zod`) must resolve from this app's own
  // node_modules — never from the monorepo root, which belongs to the web workspace.
  const fromShared = context.originModulePath.startsWith(sharedRoot + path.sep);
  const isBare = !moduleName.startsWith('.') && !path.isAbsolute(moduleName);
  if (fromShared && isBare) {
    return resolve(
      { ...context, originModulePath: path.join(projectRoot, 'package.json') },
      moduleName,
      platform,
    );
  }

  return resolve(context, moduleName, platform);
};

module.exports = config;
