// liveMarketTab.js

let materialesLocales = []; // Para guardar la lista de materiales y vincular

export async function initMarketLiveTab() {
    const status = document.getElementById('market-status');
    const tbody = document.getElementById('market-live-tbody');
    const searchInput = document.getElementById('market-search');
    const refreshBtn = document.getElementById('btn-refresh-market');


    const loadData = async () => {
        status.textContent = 'Sincronizando...';
        
        try {
            // 1. Cargamos materiales locales para el "Selector de Vínculo"
            const resMats = await fetch('/api/materiales');
            materialesLocales = await resMats.json();

            // 2. Cargamos el market live
            const resMarket = await fetch('/api/market-live');
            const data = await resMarket.json();

            if (data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-gray-500">No hay datos recientes</td></tr>';
                return;
            }

            renderRows(data);
            status.textContent = `Actualizado: ${new Date().toLocaleTimeString('es-AR')}`;
        } catch (err) {
            status.textContent = 'Error: ' + err.message;
        }
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