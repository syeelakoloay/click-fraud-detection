import test from 'node:test';
import assert from 'node:assert/strict';
import { formatGoogleAdsAmount, formatUsd } from '../src/utils/currency.js';

test('USD display places the dollar sign before the unchanged amount with US separators', () => {
  assert.equal(formatUsd(1250.75), '$1,250.75');
  assert.equal(formatUsd(681.39), '$681.39');
  assert.equal(formatUsd(3112042), '$3,112,042.00');
});

test('budget display changes notation only and does not apply an exchange rate', () => {
  assert.equal(formatUsd(18223), '$18,223.00');
  assert.equal(formatUsd(12411643), '$12,411,643.00');
});

test('Google Ads micros are converted to currency units but not exchanged by currency code', () => {
  assert.equal(formatGoogleAdsAmount(18223000000, 'IDR'), '$18,223.00');
  assert.equal(formatGoogleAdsAmount(1250750000, 'USD'), '$1,250.75');
  assert.equal(formatGoogleAdsAmount(1000000, 'EUR'), '$1.00');
});
