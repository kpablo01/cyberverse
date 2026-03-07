// api.js - todas las llamadas al backend

export async function fetchMaterials() {
    const res = await fetch('/api/materiales');
    if (!res.ok) throw new Error('Error al cargar materiales');
    return await res.json();
}

export async function fetchProfitability() {
    const res = await fetch('/api/rentabilidad');
    if (!res.ok) throw new Error('Error al cargar rentabilidad');
    return await res.json();
}

export async function fetchOrdersAnalysis() {
    const res = await fetch('/api/pedidos-rentables');
    if (!res.ok) throw new Error('Error al cargar análisis de pedidos');
    return await res.json();
}

export async function fetchRecipe(id) {
    const res = await fetch(`/api/receta/${id}`);
    if (!res.ok) throw new Error('Error al cargar receta');
    return await res.json();
}

export async function updateMaterialPrice(id, newPrice) {
    const res = await fetch(`/api/materiales/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venta: parseFloat(newPrice) || 0 })
    });
    if (!res.ok) throw new Error('Error al actualizar precio');
    return true;
}