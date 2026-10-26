export const CLOUD_SITE =
  "https://evil-alpaca-d2g9jlaor6491e737-1419902925.tcloudbaseapp.com/";
export const cloudAvailable =
  location.hostname === new URL(CLOUD_SITE).hostname ||
  location.hostname === "localhost" ||
  location.hostname === "127.0.0.1";
