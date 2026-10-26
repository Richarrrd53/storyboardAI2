// Some deployment settings include literal quotes around Windows paths.
function normalizeCredentialPath() {
    const value = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (value) process.env.GOOGLE_APPLICATION_CREDENTIALS = value.trim().replace(/^(["'])(.*)\1$/, '$2');
}
function hasLocalADC(env = process.env) {
    const path = require('node:path');
    const root = env.CLOUDSDK_CONFIG || (env.APPDATA ? path.join(env.APPDATA, 'gcloud')
        : env.HOME ? path.join(env.HOME, '.config', 'gcloud') : '');
    return Boolean(root && require('node:fs').existsSync(path.join(root, 'application_default_credentials.json')));
}

function vertexAvailable(env = process.env) {
    return Boolean(env.GOOGLE_CLOUD_PROJECT_ID && (env.GCP_SERVICE_ACCOUNT_BASE64 ||
        (env.GOOGLE_APPLICATION_CREDENTIALS && require('node:fs').existsSync(env.GOOGLE_APPLICATION_CREDENTIALS)) ||
        hasLocalADC(env) || env.K_SERVICE || env.VERCEL || env.GCE_METADATA_HOST));
}

function vertexAuthOptions(env = process.env) {
    // Explicit credential path wins. Local well-known ADC must not be replaced by a stale cloud key.
    const deployed = env.VERCEL || env.K_SERVICE || env.GCE_METADATA_HOST;
    if (env.GOOGLE_APPLICATION_CREDENTIALS || (!deployed && hasLocalADC(env)) || !env.GCP_SERVICE_ACCOUNT_BASE64) return {};
    try {
        const credentials = JSON.parse(Buffer.from(env.GCP_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8'));
        if (credentials.type !== 'service_account' || !credentials.client_email || !credentials.private_key) throw new Error();
        // Keep deployment credentials in memory; no private key files in the repository or /tmp.
        return { googleAuthOptions: { credentials } };
    } catch { throw new Error('Google credentials configuration is invalid'); }
}

module.exports = { normalizeCredentialPath, vertexAuthOptions, vertexAvailable };
