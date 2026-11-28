const asFiniteNumber = value => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};

/**
 * Display a stored budget amount with the requested dollar notation.
 * The numeric amount is intentionally preserved; this is formatting only,
 * not an exchange-rate conversion.
 */
export function formatUsd(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(asFiniteNumber(amount));
}

/**
 * Google Ads returns amounts in micros. Convert micros to the account's
 * currency unit, then apply the project's dollar display convention without
 * changing the resulting numeric amount by an FX rate.
 */
export function formatGoogleAdsAmount(amountMicros, _currencyCode = 'USD') {
  return formatUsd(asFiniteNumber(amountMicros) / 1_000_000);
}
