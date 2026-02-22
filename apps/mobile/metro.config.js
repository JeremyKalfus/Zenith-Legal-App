const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [
  path.resolve(workspaceRoot, 'packages/shared'),
];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

config.resolver.disableHierarchicalLookup = true;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'mime') {
    return {
      type: 'sourceFile',
      filePath: path.resolve(projectRoot, 'src/shims/mime.ts'),
    };
  }
  if (moduleName === 'expo-av') {
    return {
      type: 'sourceFile',
      filePath: path.resolve(projectRoot, 'src/shims/expo-av.ts'),
    };
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
