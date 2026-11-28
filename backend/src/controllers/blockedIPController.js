"use strict";

function createBlockedIPController(blockedIPService) {
  if (!blockedIPService || typeof blockedIPService.listBlockedIPs !== "function") {
    throw new TypeError("blockedIPService.listBlockedIPs wajib disediakan.");
  }

  async function listBlockedIPs(req, res, next) {
    try {
      // Pagination and limits are normalized by the existing service utility.
      const result = await blockedIPService.listBlockedIPs({
        page: req.query.page,
        limit: req.query.limit,
      });

      // Keep the existing service response contract: data, total, page, limit, totalPages.
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  }

  return { listBlockedIPs };
}

module.exports = createBlockedIPController;
