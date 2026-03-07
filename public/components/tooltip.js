// tooltip.js

import { fetchRecipe } from '../js/api.js';   // ← esto faltaba

const tooltip = document.getElementById('tooltip');

export function initTooltip() {
    // Podrías agregar event listeners globales si quisieras,
    // pero por ahora solo exponemos las funciones
}

export async function showTooltip(event, materialId) {
    try {
        const ingredients = await fetchRecipe(materialId);
        
        if (!ingredients || ingredients.length === 0) {
            tooltip.style.display = 'none';
            return;
        }

        let html = `<div class="tooltip-title">Ingredientes Requeridos</div>`;
        let costoTotal = 0;

        ingredients.forEach(ing => {
            const precio = parseFloat(ing.venta) || 0;
            const subtotal = precio * ing.cantidad;
            costoTotal += subtotal;

            html += `
                <div class="flex items-center justify-between gap-4 mb-2 border-b border-gray-800 pb-1">
                    <div class="flex items-center gap-2">
                        <img src="${ing.imagen_url}" class="w-5 h-5 object-contain">
                        <span class="text-[11px] text-gray-200">${ing.cantidad}x ${ing.nombre}</span>
                    </div>
                    <div class="text-right">
                        <span class="text-[10px] text-purple-400 font-mono">${precio.toFixed(1)} c/u</span>
                    </div>
                </div>`;
        });

        html += `
            <div class="mt-2 pt-2 border-t border-purple-900/50 flex justify-between">
                <span class="text-[10px] text-gray-400 uppercase">Valor de Mercado:</span>
                <span class="text-[11px] text-cyan-400 font-bold font-mono">${costoTotal.toFixed(1)}</span>
            </div>`;

        tooltip.innerHTML = html;
        tooltip.style.display = 'block';
        moveTooltip(event);
    } catch (err) {
        console.error('Error mostrando tooltip:', err);
        tooltip.style.display = 'none';
    }
}

export function moveTooltip(event) {
    tooltip.style.left = (event.pageX + 15) + 'px';
    tooltip.style.top  = (event.pageY + 15) + 'px';
}

export function hideTooltip() {
    tooltip.style.display = 'none';
}