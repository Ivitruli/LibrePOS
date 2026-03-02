function consolidateStock(inventoryArray) {
    const consolidated = {};
    inventoryArray.forEach(item => {
        if (!consolidated[item.id]) {
            consolidated[item.id] = { ...item };
        } else {
            consolidated[item.id].quantity += item.quantity;
            consolidated[item.id].price = item.price; 
        }
    });
    return Object.values(consolidated);
}