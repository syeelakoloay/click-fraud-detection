/**
 * Browser API helpers for the Aktivitas 28 contract.
 * GET /api/blocked-ips returns { data, total, page, limit, totalPages }.
 */
export async function fetchAllBlockedIPs({
  endpoint,
  signal,
  fetchImpl = globalThis.fetch,
  pageSize = 50,
} = {}) {
  if (typeof endpoint !== 'string' || !endpoint.trim()) {
    throw new TypeError('endpoint GET /api/blocked-ips wajib diisi.');
  }
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('fetch API tidak tersedia pada lingkungan ini.');
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new RangeError('pageSize harus berupa bilangan bulat 1 sampai 100.');
  }

  const requestPage = async (page) => {
    const separator = endpoint.includes('?') ? '&' : '?';
    const response = await fetchImpl(
      `${endpoint}${separator}page=${page}&limit=${pageSize}`,
      { headers: { Accept: 'application/json' }, signal }
    );
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} pada GET /api/blocked-ips?page=${page}`);
    }

    const payload = await response.json();
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.data)) {
      throw new TypeError('Format respons GET /api/blocked-ips harus memiliki data berupa array.');
    }

    for (const item of payload.data) {
      if (!item || typeof item !== 'object' || typeof item.ip_address !== 'string' || !item.ip_address.trim()) {
        throw new TypeError('Setiap record GET /api/blocked-ips harus memiliki ip_address berupa teks.');
      }
    }

    return { payload, rows: payload.data };
  };

  const first = await requestPage(1);
  const allRows = [...first.rows];
  const total = Number(first.payload.total ?? first.rows.length);
  const actualLimit = Number(first.payload.limit ?? pageSize);
  const reportedPages = Number(first.payload.totalPages);
  const totalPages = Number.isInteger(reportedPages) && reportedPages >= 0
    ? reportedPages
    : Math.ceil(Math.max(0, total) / Math.max(1, actualLimit));

  if (!Number.isFinite(total) || total < 0 || !Number.isFinite(actualLimit) || actualLimit < 1) {
    throw new TypeError('Metadata pagination GET /api/blocked-ips tidak valid.');
  }
  if (totalPages > 10000) {
    throw new RangeError('Jumlah halaman GET /api/blocked-ips melebihi batas aman 10.000.');
  }

  // Empty collection is a valid API response and needs no follow-up request.
  if (total === 0 || totalPages === 0) return allRows;

  const pagesToRead = Math.max(1, totalPages || Math.ceil(total / actualLimit));
  for (let start = 2; start <= pagesToRead; start += 8) {
    if (signal?.aborted) {
      const abortError = new Error('Request dibatalkan.');
      abortError.name = 'AbortError';
      throw abortError;
    }
    const pages = Array.from(
      { length: Math.min(8, pagesToRead - start + 1) },
      (_, index) => start + index
    );
    const results = await Promise.all(pages.map(requestPage));
    results.forEach(({ rows }) => allRows.push(...rows));
  }

  return allRows;
}
