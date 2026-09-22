// Some deployment settings include literal quotes around Windows paths.
function normalizeCredentialPath() {
    const value = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (value) process.env.GOOGLE_APPLICATION_CREDENTIALS = value.trim().replace(/^(["'])(.*)\1$/, '$2');
}
module.exports = { normalizeCredentialPath };
