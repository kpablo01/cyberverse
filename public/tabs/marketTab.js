// marketTab.js

import { fetchMaterials, updateMaterialPrice } from '../js/api.js';
import { showTooltip, moveTooltip, hideTooltip } from '../components/tooltip.js';

let allMaterials = [];

function renderMaterials(items) {
    const container = document.getElementById('material-list');
    container.innerHTML = items.map(item => `
        <div class="material-row-card flex items-center justify-between gap-4">
            <div class="flex items-center gap-3">
                <img src="${item.imagen_url}" class="w-8 h-8 object-contain">
                <span class="text-sm font-semibold text-gray-200">${item.nombre}</span>
            </div>
            <div class="flex items-center gap-2">
                <span class="text-[10px] text-gray-500 font-bold uppercase">Market:</span>
                <input type="number" step="0.1" value="${item.venta}" 
                       onchange="updatePrice(${item.id}, this.value)"
                       class="w-20 bg-gray-900 border border-purple-900 p-2 rounded text-right text-purple-300 outline-none focus:ring-1 ring-purple-500">
            </div>
        </div>
    `).join('');
}

export async function initMarketTab() {
    try {
        allMaterials = await fetchMaterials();
        renderMaterials(allMaterials);
    } catch (err) {
        console.error('Error inicializando Market Tab:', err);
    }

    // Buscador
    document.getElementById('search-input')?.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = allMaterials.filter(m => m.nombre.toLowerCase().includes(term));
        renderMaterials(filtered);
    });
}

// Exponemos para que main.js pueda llamar update después de cambio
window.updatePrice = async (id, value) => {
    try {
        await updateMaterialPrice(id, value);
        // Refrescamos las otras pestañas que dependen de precios
        window.refreshOtherTabs?.();
    } catch (err) {
        console.error('Fallo al actualizar precio:', err);
        alert('No se pudo actualizar el precio');
    }
};

window.updatePrice = async (id, value) => {
    try {
        const { updateMaterialPrice } = await import('../js/api.js');
        await updateMaterialPrice(id, value);
        // Refrescar otras pestañas
        window.dispatchEvent(new Event('refreshOrders'));
        window.dispatchEvent(new Event('refreshCrafting'));
    } catch (err) {
        console.error('Fallo al actualizar precio:', err);
        alert('No se pudo actualizar el precio');
    }
};