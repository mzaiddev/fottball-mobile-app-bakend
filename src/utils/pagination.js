function parsePagination(
  query = {},
  { defaultLimit = 10, maxLimit = 100 } = {},
) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(
    maxLimit,
    Math.max(1, Number.parseInt(query.limit, 10) || defaultLimit),
  );

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
}

function isPaginatedRequest(query = {}) {
  return query.page !== undefined || query.limit !== undefined;
}

function buildPaginatedResponse(items, total, page, limit) {
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasPrev: page > 1,
      hasNext: page < totalPages,
    },
  };
}

module.exports = {
  buildPaginatedResponse,
  isPaginatedRequest,
  parsePagination,
};
