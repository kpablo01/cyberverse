// craftingTab.js

import { fetchProfitability } from '../js/api.js';
import { showTooltip, moveTooltip, hideTooltip } from '../components/tooltip.js';

export async function initCraftingTab() {
    const container = document.getElementById('profit-list');
    if (!container) {
        console.warn('No se encontró #profit-list');
        return;
    }

    const loadAndRender = async () => {
        try {
            const data = await fetchProfitability();

            container.innerHTML = data.map(item => {
                const ganancia = parseFloat(item.ganancia_neta) || 0;
                return `
                <div class="flex items-center justify-between p-3 bg-gray-900/50 rounded border-l-4 ${ganancia > 0 ? 'border-green-500' : 'border-red-500'} shadow-md tooltip-trigger"
                     data-id="${item.id}">
                    <div class="flex items-center gap-3">
                        <img src="${item.imagen_url}" class="w-10 h-10 object-contain">
                        <div>
                            <p class="font-bold text-white text-sm">${item.nombre}</p>
                            <p class="text-[10px] text-gray-400 font-mono">MAT: ${parseFloat(item.costo_materiales).toFixed(1)} | ENE: ${parseFloat(item.costo_energia).toFixed(1)}</p>
                        </div>
                    </div>
                    <div class="text-right">
                        <p class="text-md font-bold ${ganancia > 0 ? 'text-green-400' : 'text-red-400'}">
                            ${ganancia > 0 ? '+' : ''}${ganancia.toFixed(2)}
                        </p>
                    </div>
                </div>`;
            }).join('');

            // ← Listeners para tooltip
            container.querySelectorAll('.tooltip-trigger').forEach(el => {
                const id = el.dataset.id;
                if (!id) return;

                el.addEventListener('mouseenter', (e) => showTooltip(e, id));
                el.addEventListener('mousemove', moveTooltip);
                el.addEventListener('mouseleave', hideTooltip);
            });

        } catch (err) {
            console.error('Error cargando Crafting Tab:', err);
        }
    };

    await loadAndRender();

    window.addEventListener('refreshCrafting', loadAndRender);
}