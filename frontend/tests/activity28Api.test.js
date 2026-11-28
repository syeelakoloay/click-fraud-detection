import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fetchAllBlockedIPs } from '../src/api.js';

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return payload; },
  };
}

test('fetchAllBlockedIPs reads all pages using the final API pagination contract', async () => {
  const requests = [];
  const pages = {
    1: { data: Array.from({ length: 50 }, (_, i) => ({ _id: `id-${i + 1}`, ip_address: `192.0.2.${i + 1}` })), total: 101, page: 1, limit: 50, totalPages: 3 },
    2: { data: Array.from({ length: 50 }, (_, i) => ({ _id: `id-${i + 51}`, ip_address: `198.51.100.${i + 1}` })), total: 101, page: 2, limit: 50, totalPages: 3 },
    3: { data: [{ _id: 'id-101', ip_address: '203.0.113.101' }], total: 101, page: 3, limit: 50, totalPages: 3 },
  };

  const rows = await fetchAllBlockedIPs({
    endpoint: '/api/blocked-ips',
    fetchImpl: async (url) => {
      requests.push(url);
      const page = Number(new URL(url, 'http://localhost').searchParams.get('page'));
      return jsonResponse(pages[page]);
    },
  });

  assert.equal(rows.length, 101);
  assert.equal(requests.length, 3);
  assert.match(requests[0], /page=1&limit=50/);
  assert.match(requests[2], /page=3&limit=50/);
  assert.equal(rows[100].ip_address, '203.0.113.101');
});

test('fetchAllBlockedIPs treats the contract empty response as a valid empty collection', async () => {
  let requestCount = 0;
  const rows = await fetchAllBlockedIPs({
    endpoint: '/api/blocked-ips',
    fetchImpl: async () => {
      requestCount += 1;
      return jsonResponse({ data: [], total: 0, page: 1, limit: 50, totalPages: 0 });
    },
  });

  assert.deepEqual(rows, []);
  assert.equal(requestCount, 1);
});

test('fetchAllBlockedIPs rejects HTTP errors rather than treating them as empty data', async () => {
  await assert.rejects(
    fetchAllBlockedIPs({ endpoint: '/api/blocked-ips', fetchImpl: async () => jsonResponse({}, 503) }),
    /HTTP 503 pada GET \/api\/blocked-ips/
  );
});

test('fetchAllBlockedIPs validates the ip_address field from each record', async () => {
  await assert.rejects(
    fetchAllBlockedIPs({
      endpoint: '/api/blocked-ips',
      fetchImpl: async () => jsonResponse({ data: [{ _id: '1' }], total: 1, page: 1, limit: 50, totalPages: 1 }),
    }),
    /harus memiliki ip_address/
  );
});

test('fetchAllBlockedIPs validates the requested page size', async () => {
  await assert.rejects(
    fetchAllBlockedIPs({ endpoint: '/api/blocked-ips', pageSize: 101 }),
    /pageSize harus berupa bilangan bulat/
  );
});


test('React Blocked IPs page calls the real collection endpoint', () => {
  const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(appSource, /import \{ fetchAllBlockedIPs \} from '\.\/api\.js'/);
  assert.match(appSource, /endpoint:\s*getApiEndpoint\('blocked-ips'\)/);
  assert.match(appSource, /GET \/api\/blocked-ips/);
  assert.match(appSource, /Blocked IPs aktual/);
});

test('React page keeps VPN/proxy risk signals separate from the blocked-IP collection', () => {
  const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(appSource, /Risk signals \(VPN \/ Proxy\)/);
  assert.match(appSource, /Sinyal ini bukan daftar IP yang diblokir/);
  assert.match(appSource, /VPN_usage=1 atau proxy_usage=1/);
});
