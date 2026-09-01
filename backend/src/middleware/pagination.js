/**
 * Pagination middleware for Express routes.
 * Extracts page, limit, search, sort, order from query params.
 * Falls back to returning all results if no pagination params provided.
 */

function parsePagination(req, defaults = {}) {
  const { defaultPage = 1, defaultLimit = 25, maxLimit = 100 } = defaults;

  const hasPageParam = req.query.page !== undefined;
  const hasLimitParam = req.query.limit !== undefined;

  if (!hasPageParam && !hasLimitParam) {
    return { page: null, limit: null, offset: null, paginate: false };
  }

  const page = Math.max(1, parseInt(req.query.page) || defaultPage);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(req.query.limit) || defaultLimit));
  const offset = (page - 1) * limit;

  return { page, limit, offset, paginate: true };
}

function paginatedResponse(data, total, page, limit) {
  const totalPages = Math.ceil(total / limit);
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

module.exports = { parsePagination, paginatedResponse };
