// Public configuration: OAuth Web Client ID is NOT a client secret.
// Keep account passwords, OAuth client secrets and Oracle credentials out of GitHub.
// Online features only activate after /abaku-api/health confirms that the API is ready.
export const ONLINE_CONFIG = Object.freeze({
  apiBase: 'https://130.61.49.108/abaku-api',
  googleClientId: '570481528048-lovvpt3ppmk6g26njl5f72qn2eqpraeq.apps.googleusercontent.com'
});
