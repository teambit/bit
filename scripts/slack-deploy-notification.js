#!/usr/bin/env node

const https = require('https');
const bitVersion = require('../package.json').version;
const githubReleaseUrl = `https://github.com/teambit/bit/releases/tag/v${bitVersion}`;
const changelogUrl = `https://github.com/teambit/bit/blob/master/CHANGELOG.md`;
const ciBuildNumber = process.env.DOC_GEN_BUILD_NUM;
const cliDocsUrl = `https://${ciBuildNumber}-79723839-gh.circle-artifacts.com/0/home/circleci/bit/bit/dist/cli.md`;
const slackBaseUrl = 'hooks.slack.com';
const ts = Date.now();

const publishToCommunity = process.argv[2] === 'community';
const slackDeploymentChannel = publishToCommunity
  ? process.env.COMMUNITY_SLACK_DEPLOYMENT_CHANNEL
  : process.env.SLACK_DEPLOYMENT_CHANNEL;
const slackSubPath = `/services/${slackDeploymentChannel}`;
const slackFullUrl = `${slackBaseUrl}/${slackDeploymentChannel}`;

const data = {
  attachments: [
    {
      fallback: `Bit version ${bitVersion} published`,
      color: '#6E3D8F',
      pretext: 'New release of Bit',
      author_name: 'Teambit',
      author_icon: 'https://storage.cloud.google.com/static.bit.dev/bit-logo.png',
      title: `Bit ${bitVersion}`,
      title_link: githubReleaseUrl,
      text: 'Yes, it happens!',
      fields: [
        {
          title: 'Change log',
          value: changelogUrl,
          short: false
        }
      ],
      ts
    }
  ]
};

const cliDocsField = {
  title: 'CLI documentation',
  value: cliDocsUrl,
  short: false
};

if (!publishToCommunity) {
  data.attachments[0].fields.push(cliDocsField);
}

const payload = JSON.stringify(data);

const options = {
  hostname: slackBaseUrl,
  port: 443,
  path: slackSubPath,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': payload.length
  }
};

const req = https.request(options, res => {
  console.log(`statusCode: ${res.statusCode}`);

  res.on('data', d => {
    process.stdout.write(d);
  });
});

req.on('error', error => {
  console.error(error);
});

req.write(payload);
req.end();
