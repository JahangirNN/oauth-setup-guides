const MULTI_PART_SUFFIXES = new Set([
  "co.uk", "org.uk", "ac.uk", "com.au", "net.au", "org.au", "co.jp", "co.in",
  "com.br", "com.mx", "co.nz", "co.za", "com.sg", "com.tr", "com.cn",
]);

const DISPLAY_NAMES: Record<string, string> = {
  "github.com": "GitHub",
  "google.com": "Google",
  "facebook.com": "Meta",
  "meta.com": "Meta",
  "x.com": "X",
  "twitter.com": "X",
  "microsoft.com": "Microsoft",
  "linear.app": "Linear",
  "cal.com": "Cal.com",
  "slack.com": "Slack",
  "notion.so": "Notion",
  "notion.com": "Notion",
  "atlassian.com": "Atlassian",
  "stripe.com": "Stripe",
  "salesforce.com": "Salesforce",
  "hubspot.com": "HubSpot",
  "shopify.com": "Shopify",
  "discord.com": "Discord",
  "spotify.com": "Spotify",
  "dropbox.com": "Dropbox",
  "asana.com": "Asana",
  "airtable.com": "Airtable",
  "figma.com": "Figma",
  "zoom.us": "Zoom",
  "twilio.com": "Twilio",
  "sendgrid.com": "SendGrid",
  "box.com": "Box",
  "gitlab.com": "GitLab",
  "bitbucket.org": "Bitbucket",
  "clickup.com": "ClickUp",
  "monday.com": "monday.com",
  "jira.com": "Jira",
  "trello.com": "Trello",
  "zendesk.com": "Zendesk",
  "intercom.com": "Intercom",
  "todoist.com": "Todoist",
  "calendly.com": "Calendly",
  "docusign.com": "DocuSign",
  "paypal.com": "PayPal",
  "plaid.com": "Plaid",
  "quickbooks.intuit.com": "QuickBooks",
  "intuit.com": "Intuit",
  "xero.com": "Xero",
  "netsuite.com": "NetSuite",
  "workday.com": "Workday",
  "servicenow.com": "ServiceNow",
  "okta.com": "Okta",
  "auth0.com": "Auth0",
  "vercel.com": "Vercel",
  "netlify.com": "Netlify",
  "cloudflare.com": "Cloudflare",
  "aws.amazon.com": "AWS",
  "amazon.com": "Amazon",
  "apple.com": "Apple",
  "linkedin.com": "LinkedIn",
  "reddit.com": "Reddit",
  "pinterest.com": "Pinterest",
  "tiktok.com": "TikTok",
  "youtube.com": "YouTube",
  "twitch.tv": "Twitch",
  "telegram.org": "Telegram",
  "whatsapp.com": "WhatsApp",
  "instagram.com": "Instagram",
  "threads.net": "Threads",
  "mastodon.social": "Mastodon",
  "bsky.app": "Bluesky",
  "gmail.com": "Gmail",
  "calendar.google.com": "Google Calendar",
  "drive.google.com": "Google Drive",
  "docs.google.com": "Google Docs",
  "sheets.google.com": "Google Sheets",
};

export function displayNameFor(domain: string): string | null {
  return DISPLAY_NAMES[domain.toLowerCase()] ?? null;
}

export function registrableDomain(hostname: string): string {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  const parts = host.split(".");
  if (parts.length <= 2) return host;
  const lastTwo = parts.slice(-2).join(".");
  if (MULTI_PART_SUFFIXES.has(lastTwo)) return parts.slice(-3).join(".");
  return lastTwo;
}

export function safeUrl(input: string): URL | null {
  const withProtocol = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  try {
    const url = new URL(withProtocol);
    if (!/^https?:$/.test(url.protocol)) return null;
    return url;
  } catch {
    return null;
  }
}

export function looksLikeUrl(input: string): boolean {
  return /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/.*)?$/i.test(input.trim());
}
