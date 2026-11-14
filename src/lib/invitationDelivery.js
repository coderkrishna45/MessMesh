export async function deliverSetupLink(
  account,
  setupUrl,
  environment = process.env,
  fetcher = fetch
) {
  if (environment.DEMO_MODE === 'true' || environment.NODE_ENV !== 'production') {
    return { status: 'preview', setupUrl };
  }
  if (!environment.MAIL_DELIVERY_URL || !environment.MAIL_DELIVERY_TOKEN) {
    return { status: 'not_configured' };
  }

  const providerUrl = new URL(environment.MAIL_DELIVERY_URL);
  if (
    providerUrl.protocol !== 'https:' &&
    !['localhost', '127.0.0.1'].includes(providerUrl.hostname)
  ) {
    throw new Error('Mail delivery provider must use HTTPS.');
  }
  const response = await fetcher(environment.MAIL_DELIVERY_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${environment.MAIL_DELIVERY_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: account.email,
      subject: 'MessMesh account setup',
      setupUrl,
    }),
  });
  if (!response.ok) {
    throw new Error(`Mail delivery provider returned ${response.status}.`);
  }
  return { status: 'sent' };
}
