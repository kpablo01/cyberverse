// liveMarketTab.js

let materialesLocales = []; // Para guardar la lista de materiales y vincular

export async function initMarketLiveTab() {
    const status = document.getElementById('market-status');
    const tbody = document.getElementById('market-live-tbody');
    const metricsContainer = document.getElementById('metrics-container'); // El nuevo div
    const refreshBtn = document.getElementById('btn-refresh-market');

    const loadData = async () => {
        status.textContent = 'Calculando métricas...';
        
        try {
            // 1. Cargamos las Métricas (Lo nuevo)
            const resMetrics = await fetch('/api/market-metrics');
            const metrics = await resMetrics.json();
            renderMetrics(metrics);

            // 2. Cargamos el Market Live (Lo que ya tenías)
            const resMarket = await fetch('/api/market-live');
            const data = await resMarket.json();
            renderRows(data); 

            status.textContent = `Actualizado: ${new Date().toLocaleTimeString('es-AR')}`;
        } catch (err) {
            status.textContent = 'Error: ' + err.message;
        }
    };

    // Función para renderizar las cards de métricas
    const renderMetrics = (metrics) => {
        if (!metricsContainer) return;
        
        // Filtramos solo los que tienen una desviación interesante (ej. bajaron más de un 2%)
        // o simplemente mostramos los top 4 más baratos respecto a su promedio.
        metricsContainer.innerHTML = metrics.slice(0, 4).map(m => {
            const pct = Number(m.desviacion_porcentaje);
            const colorClass = pct < 0 ? 'text-green-400' : 'text-red-400';
            const borderClass = pct < -5 ? 'border-green-500 animate-pulse' : 'border-purple-500';
            const signal = pct < 0 ? 'OFERTA' : 'SUBIDA';

            return `
                <div class="bg-gray-900/80 border-l-4 ${borderClass} p-3 rounded shadow-lg">
                    <div class="flex items-center gap-2 mb-2">
                        <img src="${m.imagen_url}" class="w-6 h-6 object-contain">
                        <span class="text-[11px] font-bold uppercase tracking-tighter">${m.nombre}</span>
                    </div>
                    <div class="flex justify-between items-end">
                        <div>
                            <div class="text-xs text-gray-500">Actual</div>
                            <div class="text-lg font-mono font-bold text-white">${Number(m.current_min_price).toFixed(2)}</div>
                        </div>
                        <div class="text-right">
                            <div class="text-[10px] ${colorClass} font-bold">${signal} ${pct.toFixed(1)}%</div>
                            <div class="text-[9px] text-gray-600">Prom: ${Number(m.avg_price_24h).toFixed(2)}</div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    };

    const renderRows = (data) => {
        tbody.innerHTML = data.map(item => {
            const fecha = new Date(item.listed_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
            
            // Si el item tiene nombre, ya está vinculado
            if (item.nombre) {
                return `
                <tr class="border-b border-gray-700/50 hover:bg-gray-800 transition">
                    <td class="p-2 font-mono text-cyan-500">${item.game_id}</td>
                    <td class="p-2 font-medium">${item.nombre}</td>
                    <td class="p-2 text-green-400 font-bold">${Number(item.price).toFixed(2)}</td>
                    <td class="p-2 text-gray-400">${item.amount}</td>
                    <td class="p-2 text-[10px] text-gray-500">${fecha}</td>
                    <td class="p-2">
                        <button class="bg-purple-900 hover:bg-purple-700 text-[10px] px-2 py-1 rounded"
                                onclick="updateMaterialPrice(${item.local_id}, ${item.price})">
                            SET PRECIO
                        </button>
                    </td>
                </tr>`;
            } else {
                // Si no tiene nombre, mostramos el selector para vincular game_id
                return `
                <tr class="border-b border-red-900/30 bg-red-900/10 hover:bg-red-900/20 transition">
                    <td class="p-2 font-mono text-red-500 font-bold">${item.game_id}</td>
                    <td class="p-2">
                        <select onchange="vincularGameID(${item.game_id}, this.value)" 
                                class="bg-gray-900 text-[11px] border border-red-500/50 rounded p-1 w-full outline-none">
                            <option value="">¿Qué item es este?</option>
                            ${materialesLocales.map(m => `<option value="${m.id}">${m.nombre}</option>`).join('')}
                        </select>
                    </td>
                    <td class="p-2 text-gray-400">${Number(item.price).toFixed(2)}</td>
                    <td class="p-2 text-gray-400">${item.amount}</td>
                    <td class="p-2 text-[10px] text-gray-500">${fecha}</td>
                    <td class="p-2 text-center text-red-500">⚠</td>
                </tr>`;
            }
        }).join('');
    };

    refreshBtn.addEventListener('click', loadData);
    loadData(); // Carga inicial
}

// --- FUNCIONES GLOBALES (Expuestas al Window) ---

// 1. Actualiza el precio de venta de un material ya vinculado
window.updateMaterialPrice = async function(localId, newPrice) {
    if (!confirm(`¿Actualizar precio de mercado a ${newPrice}?`)) return;
    try {
        const res = await fetch(`/api/materiales/${localId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ venta: newPrice })
        });
        if (res.ok) alert('Precio actualizado en la base local');
    } catch (err) { alert('Error: ' + err.message); }
};

// 2. Vincula un game_id a un material que no lo tenía
window.vincularGameID = async function(gameId, localId) {
    if (!localId) return;
    const nombreMat = materialesLocales.find(m => m.id == localId)?.nombre;
    
    if (!confirm(`¿Vincular de forma permanente el Game ID ${gameId} a "${nombreMat}"?`)) return;

    try {
        const res = await fetch(`/api/materiales/link-game-id/${localId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ game_id: gameId })
        });

        if (res.ok) {
            alert('Vínculo creado con éxito.');
            location.reload(); // Recargamos para que el JOIN de la base ahora traiga el nombre
        }
    } catch (err) { alert('Error al vincular: ' + err.message); }
};