const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch all files in the monorepo
config.watchFolders = [monorepoRoot];

// Let Metro know where to resolve packages (including pnpm's .pnpm folder)
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Enable symlinks for pnpm
config.resolver.unstable_enableSymlinks = true;

// Don't disable hierarchical lookup - needed for pnpm
config.resolver.disableHierarchicalLookup = false;

// Force ALL react/react-native imports to resolve to the mobile app's copy.
// pnpm hoists separate react copies into each package's node_modules,
// which causes "Cannot read property 'useContext' of null" crashes
// because react-native-css-interop gets its own React != the renderer's React.
// We must use projectRoot (not monorepoRoot) so react version matches react-native-renderer.
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Force react, react-native, and react/* subpaths to the mobile app's copy
  if (moduleName === 'react' || moduleName === 'react-native' || moduleName.startsWith('react/')) {
    return {
      filePath: require.resolve(moduleName, { paths: [projectRoot] }),
      type: 'sourceFile',
    };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './global.css' });
