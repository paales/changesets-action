# @changesets/action

## 1.5.3

### Patch Changes

- [`310ab7f`](https://github.com/changesets/action/commit/310ab7f84cdbfef05ed1eab05adeabfbe54822d1) Thanks [@paales](https://github.com/paales)! - Implement versioned tags for the release

## 1.5.2

### Patch Changes

- [`75202af`](https://github.com/changesets/action/commit/75202af132ea8e93b7e6df013dc3af557c106ba3) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Upstream ["Wire up `@octokit/plugin-throttling` with all GitHub Octokit instances"](https://github.com/changesets/action/commit/db8a1099bc0ba1dd6f46a5b9df4212e4f69e78c9)

* [`75202af`](https://github.com/changesets/action/commit/75202af132ea8e93b7e6df013dc3af557c106ba3) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Upstream ["Use logging provided by `@actions/core`"](https://github.com/changesets/action/commit/8b2818674de86a7fc69aebb9ed6b486ee32eb96e)

- [`75202af`](https://github.com/changesets/action/commit/75202af132ea8e93b7e6df013dc3af557c106ba3) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Upstream ["Add a throttling plugin to the used Octokit instance to retry requests after hitting secondary rate limits"](https://github.com/changesets/action/commit/225a1e8cbcabb7b585174ba0ad806549db40d4cd)

## 1.5.1

### Patch Changes

- [`b81ec1a`](https://github.com/changesets/action/commit/b81ec1a28f57e52e32adabca66511bafe76bcca3) Thanks [@enisdenjo](https://github.com/enisdenjo)! - githubReleaseAssets has no default

## 1.5.0

### Minor Changes

- [`3ee9d10`](https://github.com/changesets/action/commit/3ee9d10cdbe6749a7e1fd458c654ee67ddc13b71) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Merge upstream changesets/action

* [`ebbfc3c`](https://github.com/changesets/action/commit/ebbfc3cb52e856c8b3325828f20b60297861f3f6) Thanks [@dotansimha](https://github.com/dotansimha)! - Allow to specify `createGithubReleases: aggregate`, in order to publish a single GitHub Release

## 1.4.0

### Minor Changes

- [`1775681`](https://github.com/changesets/action/commit/17756819da13d9dcbf44bfd9de4301a8404301cd) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Upload assets to GitHub release

## 1.3.0

### Minor Changes

- [#167](https://github.com/changesets/action/pull/167) [`993a0a0`](https://github.com/changesets/action/commit/993a0a090df78cee07481d3886dcd8b29deb9567) Thanks [@dmregister](https://github.com/dmregister)! - Added `pullRequestNumber` to the action's outputs

### Patch Changes

- [#157](https://github.com/changesets/action/pull/157) [`521c27b`](https://github.com/changesets/action/commit/521c27bf86ec53547d6a350d208fbbbc9d576fbc) Thanks [@emmenko](https://github.com/emmenko)! - Automatically adjust GitHub PR message if it exceeds a size limit of 60k characters by omitting some of the changelog information.

## 1.2.2

### Patch Changes

- [#161](https://github.com/changesets/action/pull/161) [`52c9ce7`](https://github.com/changesets/action/commit/52c9ce75d9d8a14ea2d75e4157b0c15b7a4ac313) Thanks [@bicknellr](https://github.com/bicknellr)! - Change directory to `cwd` before running git user setup. This fixes an issue when the action starts its execution not in a git repository.

## 1.2.1

### Patch Changes

- [#144](https://github.com/changesets/action/pull/144) [`898d125`](https://github.com/changesets/action/commit/898d125cee6ba00c6a11b6cadca512752c6c910c) Thanks [@Andarist](https://github.com/Andarist)! - Updated all Changesets dependencies. This should fix parsing issues for completely empty summaries that has been fixed in `@changesets/parse@0.3.11`.

## 1.2.0

### Minor Changes

- [#130](https://github.com/changesets/action/pull/130) [`5c0997b`](https://github.com/changesets/action/commit/5c0997b25e175ecf5e1723ba07210bbcea5d92fb) Thanks [@akphi](https://github.com/akphi)! - Added `createGithubReleases` input option (defaults to `true`) to control whether to create Github releases during publish or not.

* [#134](https://github.com/changesets/action/pull/134) [`1ed9bc2`](https://github.com/changesets/action/commit/1ed9bc24b7a56462c183eb815c8f4bdf0e2e5785) Thanks [@dmregister](https://github.com/dmregister)! - Added `cwd` input option that can be used in projects that are not in the root directory.

## 1.1.0

### Minor Changes

- [#128](https://github.com/changesets/action/pull/128) [`1937303`](https://github.com/changesets/action/commit/19373036c4bad4b0183344b6f2623a3b0e42da6c) Thanks [@dhruvdutt](https://github.com/dhruvdutt)! - Setup the git user in the local config instead of the global one.

* [#131](https://github.com/changesets/action/pull/131) [`d3db9ec`](https://github.com/changesets/action/commit/d3db9eceaf41d42c56d5370d504c86851627188f) Thanks [@jacklesliewise](https://github.com/jacklesliewise)! - Added `setupGitUser` option to enable or disable setting up a default git user

## 1.0.0

### Major Changes

- [#118](https://github.com/changesets/action/pull/118) [`05c863d`](https://github.com/changesets/action/commit/05c863d3f980125585016a593b5cb45b27d19c2c) Thanks [@Andarist](https://github.com/Andarist)! - From now on this action will be released using the Changesets-based workflow (using itself). Thanks to that we'll have a good release history. The users will be able to find specific versions of the action and will be able to track changes over time. It also improves the security as the build artifact will always get built in the CI environment, using a frozen lockfile.
