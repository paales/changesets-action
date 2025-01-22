import { exec, getExecOutput } from "@actions/exec";
import { GitHub, getOctokitOptions } from "@actions/github/lib/utils";
import * as github from "@actions/github";
import * as core from "@actions/core";
import fs from "fs-extra";
import { getPackages, Package } from "@manypkg/get-packages";
import path from "path";
import * as semver from "semver";
import { PreState } from "@changesets/types";
import {
  getChangelogEntry,
  getChangedPackages,
  sortTheThings,
  getVersionsByDirectory,
} from "./utils";
import * as gitUtils from "./gitUtils";
import readChangesetState from "./readChangesetState";
import resolveFrom from "resolve-from";
import { glob } from "glob";
import { throttling } from "@octokit/plugin-throttling";
import { version } from "process";

// GitHub Issues/PRs messages have a max size limit on the
// message body payload.
// `body is too long (maximum is 65536 characters)`.
// To avoid that, we ensure to cap the message to 60k chars.
const MAX_CHARACTERS_PER_MESSAGE = 60000;

const setupOctokit = (githubToken: string) => {
  return new (GitHub.plugin(throttling))(
    getOctokitOptions(githubToken, {
      throttle: {
        onRateLimit: (retryAfter, options: any, octokit, retryCount) => {
          core.warning(
            `Request quota exhausted for request ${options.method} ${options.url}`
          );

          if (retryCount <= 2) {
            core.info(`Retrying after ${retryAfter} seconds!`);
            return true;
          }
        },
        onSecondaryRateLimit: (
          retryAfter,
          options: any,
          octokit,
          retryCount
        ) => {
          core.warning(
            `SecondaryRateLimit detected for request ${options.method} ${options.url}`
          );

          if (retryCount <= 2) {
            core.info(`Retrying after ${retryAfter} seconds!`);
            return true;
          }
        },
      },
    })
  );
};

const createAggregatedRelease = async (
  octokit: ReturnType<typeof github.getOctokit>,
  packages: Package[],
  releaseName?: string,
  tagName?: string
) => {
  const contentArr = await Promise.all(
    packages.map(async (pkg) => {
      let changelogFileName = path.join(pkg.dir, "CHANGELOG.md");
      let changelog = await fs.readFile(changelogFileName, "utf8");

      let changelogEntry = getChangelogEntry(
        changelog,
        pkg.packageJson.version
      );

      if (!changelogEntry) {
        // we can find a changelog but not the entry for this version
        // if this is true, something has probably gone wrong
        throw new Error(
          `Could not find changelog entry for ${pkg.packageJson.name}@${pkg.packageJson.version}`
        );
      }

      // If there is no content, we don't need to create a changelog entry.
      if (!changelogEntry.content.trim()) return "";

      return `## ${pkg.packageJson.name}@${pkg.packageJson.version}\n\n${changelogEntry.content}`;
    })
  );

  const body = contentArr.join("\n\n");
  const now = new Date();
  const prerelease = packages.every((pkg) =>
    pkg.packageJson.version.includes("-")
  );
  const name = releaseName || `Release ${now.toISOString()}`;
  let tag_name = tagName || `release-${+now}`;

  const releaseVersions = new Set(
    packages.map((pkg) => pkg.packageJson.version)
  );
  if (!tagName && releaseVersions.size === 1) {
    tag_name = releaseVersions.values().next().value;
  }

  await octokit.rest.repos.createRelease({
    name,
    tag_name,
    body,
    prerelease,
    ...github.context.repo,
  });
};

const createRelease = async (
  octokit: ReturnType<typeof setupOctokit>,
  { pkg, tagName, assets }: { pkg: Package; tagName: string; assets: string[] }
) => {
  try {
    let changelogFileName = path.join(pkg.dir, "CHANGELOG.md");

    let changelog = await fs.readFile(changelogFileName, "utf8");

    let changelogEntry = getChangelogEntry(changelog, pkg.packageJson.version);
    if (!changelogEntry) {
      // we can find a changelog but not the entry for this version
      // if this is true, something has probably gone wrong
      throw new Error(
        `Could not find changelog entry for ${pkg.packageJson.name}@${pkg.packageJson.version}`
      );
    }

    const release = await octokit.rest.repos.createRelease({
      name: tagName,
      tag_name: tagName,
      body: changelogEntry.content,
      prerelease: pkg.packageJson.version.includes("-"),
      ...github.context.repo,
    });

    for (const pattern of assets) {
      const assets = await new Promise<string[]>((resolve, reject) =>
        glob(pattern, (err, matches) => (err ? reject(err) : resolve(matches)))
      );
      console.log(`Pattern ${pattern} matched the following assets: ${assets}`);
      for (const asset of assets) {
        await octokit.rest.repos.uploadReleaseAsset({
          release_id: release.data.id,
          name: path.basename(asset),
          // @ts-expect-error buffer is also accepted even though incorrectly typed
          data: await fs.readFile(asset),
          ...github.context.repo,
        });
      }
    }
  } catch (err) {
    // if we can't find a changelog, the user has probably disabled changelogs
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      err.code !== "ENOENT"
    ) {
      throw err;
    }
  }
};

export type PublishOptions = {
  script: string;
  githubToken: string;
  createGithubReleases: boolean | "aggregate";
  githubReleaseName?: string;
  githubTagName?: string;
  githubReleaseAssets: string[];
  cwd?: string;
};

type PublishedPackage = { name: string; version: string };

type PublishResult =
  | {
      published: true;
      publishedPackages: PublishedPackage[];
    }
  | {
      published: false;
    };

export async function runPublish({
  script,
  githubToken,
  createGithubReleases,
  githubReleaseAssets,
  githubReleaseName,
  githubTagName,
  cwd = process.cwd(),
}: PublishOptions): Promise<PublishResult> {
  const octokit = setupOctokit(githubToken);

  let [publishCommand, ...publishArgs] = script.split(/\s+/);

  let changesetPublishOutput = await getExecOutput(
    publishCommand,
    publishArgs,
    { cwd }
  );

  await gitUtils.pushTags();

  let { packages, tool } = await getPackages(cwd);
  let releasedPackages: Package[] = [];

  if (tool !== "root") {
    let newTagRegex = /New tag:\s+(@[^/]+\/[^@]+|[^/]+)@([^\s]+)/;
    let packagesByName = new Map(packages.map((x) => [x.packageJson.name, x]));

    for (let line of changesetPublishOutput.stdout.split("\n")) {
      let match = line.match(newTagRegex);
      if (match === null) {
        continue;
      }
      let pkgName = match[1];
      let pkg = packagesByName.get(pkgName);
      if (pkg === undefined) {
        throw new Error(
          `Package "${pkgName}" not found.` +
            "This is probably a bug in the action, please open an issue"
        );
      }
      releasedPackages.push(pkg);
    }

    if (createGithubReleases === true) {
      await Promise.all(
        releasedPackages.map((pkg) =>
          createRelease(octokit, {
            pkg,
            tagName: `${pkg.packageJson.name}@${pkg.packageJson.version}`,
            assets: githubReleaseAssets,
          })
        )
      );
    } else if (createGithubReleases === "aggregate") {
      if (releasedPackages.length > 0) {
        await createAggregatedRelease(
          octokit,
          releasedPackages,
          githubReleaseName,
          githubTagName
        );
      }
    }
  } else {
    if (packages.length === 0) {
      throw new Error(
        `No package found.` +
          "This is probably a bug in the action, please open an issue"
      );
    }
    let pkg = packages[0];
    let newTagRegex = /New tag:/;

    for (let line of changesetPublishOutput.stdout.split("\n")) {
      let match = line.match(newTagRegex);

      if (match) {
        releasedPackages.push(pkg);
        if (createGithubReleases) {
          await createRelease(octokit, {
            pkg,
            tagName: `v${pkg.packageJson.version}`,
            assets: githubReleaseAssets,
          });
        }
        break;
      }
    }
  }

  if (releasedPackages.length) {
    return {
      published: true,
      publishedPackages: releasedPackages.map((pkg) => ({
        name: pkg.packageJson.name,
        version: pkg.packageJson.version,
      })),
    };
  }

  return { published: false };
}

const requireChangesetsCliPkgJson = (cwd: string) => {
  try {
    return require(resolveFrom(cwd, "@changesets/cli/package.json"));
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      err.code === "MODULE_NOT_FOUND"
    ) {
      throw new Error(
        `Have you forgotten to install \`@changesets/cli\` in "${cwd}"?`
      );
    }
    throw err;
  }
};

type GetMessageOptions = {
  hasPublishScript: boolean;
  branch: string;
  changedPackagesInfo: {
    highestLevel: number;
    private: boolean;
    content: string;
    header: string;
  }[];
  prBodyMaxCharacters: number;
  preState?: PreState;
  githubReleaseAssets?: string[];
};

export async function getVersionPrBody({
  hasPublishScript,
  preState,
  changedPackagesInfo,
  prBodyMaxCharacters,
  branch,
  githubReleaseAssets,
}: GetMessageOptions) {
  let messageHeader = `This PR was opened by the [Changesets release](https://github.com/changesets/action) GitHub action. When you're ready to do a release, you can merge this and ${
    hasPublishScript
      ? `the packages will be published to npm automatically`
      : `publish to npm yourself or [setup this action to publish automatically](https://github.com/changesets/action#with-publishing)`
  }. If you're not ready to do a release yet, that's fine, whenever you add more changesets to ${branch}, this PR will be updated.
`;
  let messagePrestate = !!preState
    ? `⚠️⚠️⚠️⚠️⚠️⚠️

\`${branch}\` is currently in **pre mode** so this branch has prereleases rather than normal releases. If you want to exit prereleases, run \`changeset pre exit\` on \`${branch}\`.

⚠️⚠️⚠️⚠️⚠️⚠️
`
    : "";
  let messageReleasesHeading = `# Releases`;

  let fullMessage = [
    messageHeader,
    messagePrestate,
    messageReleasesHeading,
    ...changedPackagesInfo.map((info) => `${info.header}\n\n${info.content}`),
  ].join("\n");

  // Check that the message does not exceed the size limit.
  // If not, omit the changelog entries of each package.
  if (fullMessage.length > prBodyMaxCharacters) {
    fullMessage = [
      messageHeader,
      messagePrestate,
      messageReleasesHeading,
      `\n> The changelog information of each package has been omitted from this message, as the content exceeds the size limit.\n`,
      ...changedPackagesInfo.map((info) => `${info.header}\n\n`),
    ].join("\n");
  }

  // Check (again) that the message is within the size limit.
  // If not, omit all release content this time.
  if (fullMessage.length > prBodyMaxCharacters) {
    fullMessage = [
      messageHeader,
      messagePrestate,
      messageReleasesHeading,
      `\n> All release information have been omitted from this message, as the content exceeds the size limit.`,
    ].join("\n");
  }

  // Append the assets that are to be uploaded to the GitHub release
  if (githubReleaseAssets && githubReleaseAssets.length) {
    fullMessage += "\n";
    fullMessage += "# GitHub Release Assets\n\n";
    for (const asset of githubReleaseAssets) {
      fullMessage += "1. `" + asset + "`\n";
    }
  }

  return fullMessage;
}

type VersionOptions = {
  script?: string;
  githubToken: string;
  cwd?: string;
  prTitle?: string;
  commitMessage?: string;
  hasPublishScript?: boolean;
  prBodyMaxCharacters?: number;
  githubReleaseAssets?: string[];
};

type RunVersionResult = {
  pullRequestNumber: number;
};

export async function runVersion({
  script,
  githubToken,
  cwd = process.cwd(),
  prTitle = "Version Packages",
  commitMessage = "Version Packages",
  hasPublishScript = false,
  prBodyMaxCharacters = MAX_CHARACTERS_PER_MESSAGE,
  githubReleaseAssets,
}: VersionOptions): Promise<RunVersionResult> {
  const octokit = setupOctokit(githubToken);

  let repo = `${github.context.repo.owner}/${github.context.repo.repo}`;
  let branch = github.context.ref.replace("refs/heads/", "");
  let versionBranch = `changeset-release/${branch}`;

  let { preState } = await readChangesetState(cwd);

  await gitUtils.switchToMaybeExistingBranch(versionBranch);
  await gitUtils.reset(github.context.sha);

  let versionsByDirectory = await getVersionsByDirectory(cwd);

  if (script) {
    let [versionCommand, ...versionArgs] = script.split(/\s+/);
    await exec(versionCommand, versionArgs, { cwd });
  } else {
    let changesetsCliPkgJson = requireChangesetsCliPkgJson(cwd);
    let cmd = semver.lt(changesetsCliPkgJson.version, "2.0.0")
      ? "bump"
      : "version";
    await exec("node", [resolveFrom(cwd, "@changesets/cli/bin.js"), cmd], {
      cwd,
    });
  }

  let searchQuery = `repo:${repo}+state:open+head:${versionBranch}+base:${branch}+is:pull-request`;
  let searchResultPromise = octokit.rest.search.issuesAndPullRequests({
    q: searchQuery,
  });
  let changedPackages = await getChangedPackages(cwd, versionsByDirectory);
  let changedPackagesInfoPromises = Promise.all(
    changedPackages.map(async (pkg) => {
      let changelogContents = await fs.readFile(
        path.join(pkg.dir, "CHANGELOG.md"),
        "utf8"
      );

      let entry = getChangelogEntry(changelogContents, pkg.packageJson.version);
      if (!entry.content.trim()) return null;
      return {
        highestLevel: entry.highestLevel,
        private: !!pkg.packageJson.private,
        content: entry.content,
        header: `## ${pkg.packageJson.name}@${pkg.packageJson.version}`,
      };
    })
  );

  const finalPrTitle = `${prTitle}${!!preState ? ` (${preState.tag})` : ""}`;

  // project with `commit: true` setting could have already committed files
  if (!(await gitUtils.checkIfClean())) {
    const finalCommitMessage = `${commitMessage}${
      !!preState ? ` (${preState.tag})` : ""
    }`;
    await gitUtils.commitAll(finalCommitMessage);
  }

  await gitUtils.push(versionBranch, { force: true });

  let searchResult = await searchResultPromise;
  core.info(JSON.stringify(searchResult.data, null, 2));

  const changedPackagesInfo = (await changedPackagesInfoPromises)
    .filter(
      <T>(value: T): value is NonNullable<T> =>
        value !== null && value !== undefined
    )
    .sort(sortTheThings);

  let prBody = await getVersionPrBody({
    hasPublishScript,
    preState,
    branch,
    changedPackagesInfo,
    prBodyMaxCharacters,
    githubReleaseAssets,
  });

  if (searchResult.data.items.length === 0) {
    core.info("creating pull request");
    const { data: newPullRequest } = await octokit.rest.pulls.create({
      base: branch,
      head: versionBranch,
      title: finalPrTitle,
      body: prBody,
      ...github.context.repo,
    });

    return {
      pullRequestNumber: newPullRequest.number,
    };
  } else {
    const [pullRequest] = searchResult.data.items;

    core.info(`updating found pull request #${pullRequest.number}`);
    await octokit.rest.pulls.update({
      pull_number: pullRequest.number,
      title: finalPrTitle,
      body: prBody,
      ...github.context.repo,
    });

    return {
      pullRequestNumber: pullRequest.number,
    };
  }
}
