# Publishing MapMyCode

This project now supports two distribution paths:

1. GitHub Releases with an attached `.vsix`
2. VS Code Marketplace publication

## GitHub release flow

The repository is already configured to package a `.vsix` automatically when a tag matching `v*` is pushed.

Example:

```bash
git tag v0.1.1
git push mapmycode v0.1.1
```

That triggers `.github/workflows/release.yml`, which builds the extension and uploads `mapmycode.vsix` to the GitHub release.

## Local packaging

```bash
npm install
npm run build
npm run package:vsix
```

## VS Code Marketplace publication

Marketplace publishing requires a real VS Code publisher account and a Personal Access Token. Those credentials are not available from this workspace, so publication must be done by the repository owner.

### One-time setup

1. Create or verify a publisher at `https://marketplace.visualstudio.com/manage`.
2. Install `vsce` if needed:

```bash
npm install
```

3. Create a Personal Access Token for the Visual Studio Marketplace.
4. Log in with:

```bash
npx vsce login HimakarRaju
```

### Publish a release

Ensure `package.json` has the correct version, then run:

```bash
npx vsce publish
```

Or publish a specific version explicitly:

```bash
npx vsce publish 0.1.1
```

## Recommended release checklist

1. Update `CHANGELOG.md`
2. Bump the version in `package.json`
3. Run `npm run build`
4. Run `npm run package:vsix`
5. Commit and push `main`
6. Create and push a `v*` tag
7. Verify the GitHub release asset
8. Publish to the Marketplace with `npx vsce publish`
