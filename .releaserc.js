const { promisify } = require('util')
const dateFormat = require('dateformat')
const readFileAsync = promisify(require('fs').readFile)
const path = require('path')
// Given a `const` variable `TEMPLATE_DIR` which points to "<semantic-release-gitmoji>/lib/assets/templates"

// the *.hbs template and partials should be passed as strings of contents
const template = readFileAsync(path.join('semantic-release-templates', 'default-template.hbs'))
const commitTemplate = readFileAsync(path.join('semantic-release-templates', 'commit-template.hbs'))

module.exports = {
  branches: ["main" ,{
    name:"develop",
    prerelease: true
  }],
  plugins: [
    [
      'semantic-release-gitmoji', {
      releaseRules: {
        major: [ ':boom:' ],
        minor: [ ':sparkles:', ':sparkle' ],
        patch: [
          ':bug:',
          ':ambulance:',
          ':lock:'
        ]
      },
      releaseNotes: {
        template,
        partials: { commitTemplate },
        helpers: {
          datetime: function (format = 'UTC:yyyy-mm-dd') {
            return dateFormat(new Date(), format)
          }
        },
        issueResolution: {
          template: '{baseUrl}/{owner}/{repo}/issues/{ref}',
          baseUrl: 'https://github.com',
          source: 'github.com'
        }
      }
    }
    ],
    '@semantic-release/github',
    '@semantic-release/npm'
  ],
  tagFormat: '${version}',


}