// ordersTab.js - Versión más estable y con chequeos

import { fetchOrdersAnalysis } from '../js/api.js';
import { showTooltip, moveTooltip, hideTooltip } from '../components/tooltip.js';

export async function initOrdersTab() {
    const container = document.getElementById('pedidos-list');
    const multiplierInput = document.getElementById('order-multiplier');

    if (!container) {
        console.error('No se encontró el elemento #pedidos-list');
        return;
    }

    if (!multiplierInput) {
        console.warn('No se encontró #order-multiplier → usando valor fijo 1.4');
    }

    let cachedData = []; // datos crudos del backend

    const getMultiplier = () => {
        if (!multiplierInput) return 1.4;
        let val = parseFloat(multiplierInput.value);
        if (isNaN(val)) val = 1.4;
        // Limitar rango 0 a 2
        val = Math.max(0, Math.min(2, val));
        multiplierInput.value = val.toFixed(1); // normalizar visualmente
        return val;
    };

    const renderTable = () => {
        if (!cachedData || cachedData.length === 0) {
            container.innerHTML = `
                <tr>
                    <td colspan="4" class="p-6 text-center text-gray-500">
                        No hay datos disponibles o aún no se cargaron
                    </td>
                </tr>`;
            return;
        }

        const multiplier = getMultiplier();

        container.innerHTML = cachedData.map(item => {
            try {
                const compra = parseFloat(item.compra) || 0;
                const pagoPedido = compra * multiplier;
                const netoMarket = parseFloat(item.neto_market) || 0;
                const esMejorPedido = pagoPedido > netoMarket;
                const recomendacion = esMejorPedido ? 'PEDIDO' : 'MARKET';
                const target = pagoPedido / 0.95;

                return `
                <tr class="border-b border-gray-700/50 hover:bg-gray-800 transition">
                    <td class="p-2 flex items-center gap-2 cursor-help tooltip-trigger" data-id="${item.id || ''}">
                        <img src="${item.imagen_url || ''}" class="w-5 h-5 object-contain" alt="${item.nombre || ''}">
                        <span class="text-gray-200 font-medium">${item.nombre || 'Sin nombre'}</span>
                    </td>
                    <td class="p-2 font-mono ${esMejorPedido ? 'text-green-400 font-bold' : 'text-gray-400'}">
                        ${pagoPedido.toFixed(1)}
                    </td>
                    <td class="p-2 font-mono ${!esMejorPedido ? 'text-green-400 font-bold' : 'text-gray-400'}">
                        ${netoMarket.toFixed(1)}
                        <span class="block text-[8px] text-gray-600 italic">Fee -5% incl.</span>
                    </td>
                    <td class="p-2 text-center">
                        <div class="px-1 py-0.5 rounded text-[9px] font-bold mb-1 ${esMejorPedido ? 'bg-yellow-900 text-yellow-300' : 'bg-blue-900 text-blue-300'}">
                            ${recomendacion}
                        </div>
                        <div class="text-[8px] text-gray-500">Target: >${target.toFixed(1)}</div>
                    </td>
                </tr>`;
            } catch (err) {
                console.warn('Error renderizando ítem:', item, err);
                return '';
            }
        }).join('');

        // Limpiar listeners previos y agregar nuevos (evita duplicados)
        const triggers = container.querySelectorAll('.tooltip-trigger');
        triggers.forEach(el => {
            // Remover listeners viejos si existen (simple pero efectivo)
            const newEl = el.cloneNode(true);
            el.parentNode.replaceChild(newEl, el);
        });

        // Agregar listeners frescos
        container.querySelectorAll('.tooltip-trigger').forEach(cell => {
            const id = cell.dataset.id;
            if (!id) return;

            cell.addEventListener('mouseenter', (e) => showTooltip(e, id));
            cell.addEventListener('mousemove', moveTooltip);
            cell.addEventListener('mouseleave', hideTooltip);
        });
    };

    const loadData = async () => {
        try {
            const data = await fetchOrdersAnalysis();
            cachedData = Array.isArray(data) ? data : [];
            renderTable();
        } catch (err) {
            console.error('Error al cargar datos de orders:', err);
            container.innerHTML = `
                <tr>
                    <td colspan="4" class="p-6 text-center text-red-400">
                        Error al cargar los datos. Intenta refrescar la página.
                    </td>
                </tr>`;
        }
    };

    // Carga inicial
    await loadData();

    // Listener del input (si existe)
    if (multiplierInput) {
        multiplierInput.addEventListener('input', () => {
            renderTable();
        });

        // También reaccionar a 'change' por si usan flechas o enter
        multiplierInput.addEventListener('change', () => {
            renderTable();
        });
    }

    // Refresco externo (cuando cambian precios en market)
    window.addEventListener('refreshOrders', loadData);
}