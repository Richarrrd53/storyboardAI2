const fs = require('node:fs');
const path = require('node:path');

// Some deployment settings include literal quotes around Windows paths.
function normalizeCredentialPath() {
    let value = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (value) {
        process.env.GOOGLE_APPLICATION_CREDENTIALS = value.trim().replace(/^(["'])(.*)\1$/, '$2');
    } else {
        const localPath = path.join(process.cwd(), 'application_default_credentials.json');
        if (fs.existsSync(localPath)) {
            process.env.GOOGLE_APPLICATION_CREDENTIALS = localPath;
        }
    }
}
module.exports = { normalizeCredentialPath };

