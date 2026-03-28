const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const fs = require('fs');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch the entire monorepo so imports from sibling packages resolve
config.watchFolders = [monorepoRoot];

// Resolve from workspace node_modules first, then root (hoisted)
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Helper: find a package in workspace first, fall back to monorepo root
function resolvePackage(name) {
  const workspace = path.resolve(projectRoot, 'node_modules', name);
  if (fs.existsSync(workspace)) return workspace;
  return path.resolve(monorepoRoot, 'node_modules', name);
}

// Guarantee single-copy resolution for critical RN packages
config.resolver.extraNodeModules = {
  'react-native': resolvePackage('react-native'),
  react: resolvePackage('react'),
};

module.exports = config;
