const roundQuantity = (value) => Math.round((Number(value) + Number.EPSILON) * 10000) / 10000;

export const calculateAvailableStockPieces = (
    physicalTotal,
    dmsTotal,
    approvedAsCurrentStock = false
) => {
    const physical = Number(physicalTotal) || 0;
    const dms = Number(dmsTotal) || 0;
    return roundQuantity(approvedAsCurrentStock === true ? physical : physical - dms);
};

export default calculateAvailableStockPieces;
