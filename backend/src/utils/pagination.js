export function parsePaginationQuery(page, limit, defaultLimit = 10, maxLimit = 100) {
    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.min(maxLimit, Math.max(1, parseInt(limit, 10) || defaultLimit));
    const offset = (parsedPage - 1) * parsedLimit;

    return {
        page: parsedPage,
        limit: parsedLimit,
        offset,
    };
}

export function buildPaginatedResponse(rows, total, page, limit) {
    const safeTotal = Number(total) || 0;
    const safeLimit = Math.max(1, Number(limit) || 10);
    const safePage = Math.max(1, Number(page) || 1);

    return {
        data: rows,
        total: safeTotal,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.max(1, Math.ceil(safeTotal / safeLimit)),
    };
}

export function buildLimitOffsetClause(pagination) {
    const limit = Math.max(1, parseInt(pagination?.limit, 10) || 10);
    const offset = Math.max(0, parseInt(pagination?.offset, 10) || 0);

    return {
        limit,
        offset,
        clause: ` LIMIT ${limit} OFFSET ${offset}`,
    };
}

export function shouldReturnAllRecords(all) {
    return String(all || '').toLowerCase() === 'true' || String(all || '') === '1';
}

export function parseStatusIn(statusIn, packagingStatus) {
    if (statusIn) {
        return String(statusIn)
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean);
    }

    if (packagingStatus) {
        return [String(packagingStatus).trim()].filter(Boolean);
    }

    return [];
}
