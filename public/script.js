let allMaterials = [];
const tooltip = document.getElementById('tooltip');

// --- LÓGICA DE TOOLTIP ---
async function showTooltip(e, id) {
    try {
        const res = await fetch(`/api/receta/${id}`);
        const data = await res.json();
        
        if (!data || data.length === 0) {
            tooltip.style.display = 'none';
            return;
        }

        let html = `<div class="tooltip-title">Ingredientes Requeridos</div>`;
        let costoTotalVenta = 0;

        data.forEach(ing => {
            const precioVenta = parseFloat(ing.venta) || 0;
            const subtotal = precioVenta * ing.cantidad;
            costoTotalVenta += subtotal;

            html += `
                <div class="flex items-center justify-between gap-4 mb-2 border-b border-gray-800 pb-1">
                    <div class="flex items-center gap-2">
                        <img src="${ing.imagen_url}" class="w-5 h-5 object-contain">
                        <span class="text-[11px] text-gray-200">${ing.cantidad}x ${ing.nombre}</span>
                    </div>
                    <div class="text-right">
                        <span class="text-[10px] text-purple-400 font-mono">${precioVenta.toFixed(1)} c/u</span>
                    </div>
                </div>`;
        });
        
        // Bonus: Sumatoria total de los materiales a precio de mercado
        html += `
            <div class="mt-2 pt-2 border-t border-purple-900/50 flex justify-between">
                <span class="text-[10px] text-gray-400 uppercase">Valor de Mercado:</span>
                <span class="text-[11px] text-cyan-400 font-bold font-mono">${costoTotalVenta.toFixed(1)}</span>
            </div>`;

        tooltip.innerHTML = html;
        tooltip.style.display = 'block';
        moveTooltip(e);
    } catch (err) { console.error(err); }
}

function moveTooltip(e) {
    tooltip.style.left = (e.pageX + 15) + 'px';
    tooltip.style.top = (e.pageY + 15) + 'px';
}

function hideTooltip() { tooltip.style.display = 'none'; }

// --- LLAMADAS API ---

async function loadMaterials() {
    const res = await fetch('/api/materiales');
    allMaterials = await res.json();
    renderMaterials(allMaterials);
}

async function updatePrice(id, value) {
    await fetch(`/api/materiales/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venta: parseFloat(value) || 0 })
    });
    // Actualizar todo el dashboard al cambiar un precio
    loadProfitability(); 
    loadOrdersAnalysis();
}

async function loadProfitability() {
    const res = await fetch('/api/rentabilidad');
    const data = await res.json();
    const container = document.getElementById('profit-list');
    
    container.innerHTML = data.map(item => {
        const ganancia = parseFloat(item.ganancia_neta) || 0;
        return `
        <div class="flex items-center justify-between p-3 bg-gray-900/50 rounded border-l-4 ${ganancia > 0 ? 'border-green-500' : 'border-red-500'} shadow-md"
             onmouseenter="showTooltip(event, ${item.id})" onmousemove="moveTooltip(event)" onmouseleave="hideTooltip()">
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
}

async function loadOrdersAnalysis() {
    const res = await fetch('/api/pedidos-rentables');
    const data = await res.json();
    const container = document.getElementById('pedidos-list');
    
    container.innerHTML = data.map(item => {
        const pagoPedido = parseFloat(item.pago_pedido) || 0;
        const netoMarket = parseFloat(item.neto_market) || 0;
        const mejorOpcion = item.recomendacion; // Viene del SQL
        const mejorEsPedido = mejorOpcion === 'PEDIDO';
        const target = pagoPedido / 0.95;

        return `
        <tr class="border-b border-gray-700/50 hover:bg-gray-800 transition">
            <td class="p-2 flex items-center gap-2 cursor-help" onmouseenter="showTooltip(event, ${item.id})" onmousemove="moveTooltip(event)" onmouseleave="hideTooltip()">
                <img src="${item.imagen_url}" class="w-5 h-5 object-contain">
                <span class="text-gray-200 font-medium">${item.nombre}</span>
            </td>
            <td class="p-2 font-mono ${mejorEsPedido ? 'text-green-400 font-bold' : 'text-gray-400'}">
                ${pagoPedido.toFixed(1)}
            </td>
            <td class="p-2 font-mono ${!mejorEsPedido ? 'text-green-400 font-bold' : 'text-gray-400'}">
                ${netoMarket.toFixed(1)}
                <span class="block text-[8px] text-gray-600 italic">Fee -5% incl.</span>
            </td>
            <td class="p-2 text-center">
                <div class="px-1 py-0.5 rounded text-[9px] font-bold mb-1 ${mejorEsPedido ? 'bg-yellow-900 text-yellow-300' : 'bg-blue-900 text-blue-300'}">
                    ${mejorOpcion}
                </div>
                <div class="text-[8px] text-gray-500">Target: >${target.toFixed(1)}</div>
            </td>
        </tr>`;
    }).join('');
}

function switchTab(tabId) {
    // Ocultar todos los contenidos
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.add('hidden');
    });
    
    // Quitar clase activa de botones
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active-tab');
    });
    
    // Mostrar la elegida
    document.getElementById(tabId).classList.remove('hidden');
    
    // Activar botón (asumiendo que los botones se llaman btn-market, etc.)
    const btnId = 'btn-' + tabId.split('-')[1];
    document.getElementById(btnId).classList.add('active-tab');
}

// Modificamos el renderMaterials para que use el nuevo grid de 2 columnas
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

// --- BUSCADOR ---
document.getElementById('search-input').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = allMaterials.filter(m => m.nombre.toLowerCase().includes(term));
    renderMaterials(filtered);
});

document.addEventListener('DOMContentLoaded', () => {
    loadMaterials();
    loadProfitability();
    loadOrdersAnalysis();
});