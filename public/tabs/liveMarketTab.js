let materialesLocales = [];
let globalChart = null;
let detailChart = null;

export async function initMarketLiveTab() {
    const elements = {
        status: document.getElementById('market-status'),
        tbody: document.getElementById('market-live-tbody'),
        metrics: document.getElementById('metrics-container'),
        sales: document.getElementById('sales-container'),
        refresh: document.getElementById('btn-refresh-market'),
        search: document.getElementById('market-search')
    };

    const loadData = async () => {
        if (elements.status) elements.status.textContent = 'SYNCING...';
        try {
            const [resMats, resMetrics, resMarket, resSales] = await Promise.all([
                fetch('/api/materiales').then(r => r.json()),
                fetch('/api/market-metrics').then(r => r.json()),
                fetch('/api/market-live').then(r => r.json()),
                fetch('/api/market-sales-tracker').then(r => r.json())
            ]);

            materialesLocales = resMats;
            renderMetrics(resMetrics);
            renderRows(resMarket);
            renderSalesData(resSales);

            if (elements.status) elements.status.textContent = `LIVE | ${new Date().toLocaleTimeString('es-AR')}`;
        } catch (err) {
            console.error(err);
            if (elements.status) elements.status.textContent = 'LINK ERROR';
        }
    };

    const renderMetrics = (metrics) => {
        if (!elements.metrics) return;
        
        // Calcular volumen total para el header
        const totalVol = metrics.reduce((acc, m) => acc + (Number(m.current_min_price) * Number(m.current_total_supply)), 0);
        document.getElementById('stat-volume').textContent = `${totalVol.toLocaleString()} CYPX`;
    
        elements.metrics.innerHTML = metrics.slice(0, 8).map(m => {
            const pct = Number(m.desviacion_porcentaje);
            const isCheap = pct < -5;
            const barWidth = Math.min(Math.abs(pct) * 2, 100); // Visualización de la brecha de precio
    
            return `
                <div class="bg-gray-900/40 border ${isCheap ? 'border-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.1)]' : 'border-gray-800/50'} p-4 rounded-xl relative overflow-hidden group hover:bg-gray-800/40 transition-all duration-300">
                    <div class="absolute top-0 right-0 p-1">
                        <div class="h-1 w-8 ${pct < 0 ? 'bg-green-500' : 'bg-red-500'} opacity-30"></div>
                    </div>
    
                    <div class="flex items-center gap-3 mb-3">
                        <div class="relative">
                            <img src="${m.imagen_url}" class="w-10 h-10 object-contain z-10 relative">
                            <div class="absolute inset-0 bg-purple-500/20 blur-lg rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        </div>
                        <div class="truncate">
                            <h4 class="text-[9px] font-black text-gray-500 uppercase tracking-tighter truncate">${m.nombre}</h4>
                            <div class="text-lg font-mono font-bold text-white tracking-tighter leading-none">
                                ${Number(m.current_min_price).toFixed(2)}
                            </div>
                        </div>
                    </div>
    
                    <div class="space-y-1">
                        <div class="flex justify-between text-[8px] font-mono">
                            <span class="text-gray-600 uppercase">Volatility</span>
                            <span class="${pct < 0 ? 'text-green-400' : 'text-red-400'} font-bold">${pct > 0 ? '+' : ''}${pct.toFixed(1)}%</span>
                        </div>
                        <div class="h-[2px] w-full bg-gray-800 rounded-full overflow-hidden">
                            <div class="h-full ${pct < 0 ? 'bg-green-500' : 'bg-red-500'} transition-all duration-1000" style="width: ${barWidth}%"></div>
                        </div>
                    </div>
    
                    <div class="mt-3 flex justify-between items-center border-t border-gray-800/50 pt-2">
                        <div class="text-[8px] text-gray-600 font-mono italic">SUPPLY: ${m.current_total_supply}</div>
                        ${isCheap ? '<span class="text-[7px] bg-green-500/20 text-green-400 px-1 rounded animate-pulse font-bold">UNDERVALUED</span>' : ''}
                    </div>
                </div>`;
        }).join('');
    };
    
    const renderSalesData = (sales) => {
        const list = document.getElementById('sales-list');
        if (!list) return;
    
        if (sales.length === 0) {
            list.innerHTML = '<div class="text-center text-gray-600 text-[10px] py-20 uppercase font-mono tracking-widest opacity-30 italic">No incoming data...</div>';
            return;
        }
    
        list.innerHTML = sales.map(s => {
            const timeAgo = Math.floor(Math.random() * 59) + 1; // Simulación de tiempo para el look
            return `
                <div class="group border-l-2 border-blue-500/20 bg-blue-500/5 p-2 rounded-r-lg hover:bg-blue-500/10 transition-all border-b border-white/5">
                    <div class="flex justify-between items-start mb-1">
                        <span class="text-[8px] font-mono text-blue-400 uppercase tracking-tighter">Transaction Hash #72${Math.floor(Math.random()*900)}</span>
                        <span class="text-[7px] text-gray-600 font-mono">${timeAgo}s ago</span>
                    </div>
                    <div class="flex justify-between items-center">
                        <div class="text-[11px] text-gray-300 font-bold">${s.nombre}</div>
                        <div class="text-right">
                            <div class="text-[10px] text-white font-mono font-bold">x${s.volumen_vendido}</div>
                            <div class="text-[8px] text-blue-300/60 font-mono">${Number(s.precio_venta_promedio).toFixed(2)} ea</div>
                        </div>
                    </div>
                </div>`;
        }).join('');
    };
    
    const renderRows = (data) => {
        if (!elements.tbody) return;
        elements.tbody.innerHTML = data.map(item => {
            const hora = new Date(item.listed_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
            if (item.nombre) {
                return `
                <tr class="hover:bg-white/5 transition group">
                    <td class="p-3 font-mono text-cyan-700 text-[10px]">${item.game_id}</td>
                    <td class="p-3 text-sm text-gray-200 font-medium cursor-pointer hover:text-purple-400" 
                        onclick="verHistorialMensual(${item.game_id}, '${item.nombre}')">
                        <div class="flex items-center gap-2">
                            <img src="${item.imagen_url}" class="w-5 h-5 opacity-70 group-hover:opacity-100">
                            ${item.nombre}
                        </div>
                    </td>
                    <td class="p-3 font-mono text-green-400 font-bold">${Number(item.price).toFixed(2)}</td>
                    <td class="p-3 text-xs text-gray-500">${item.amount}</td>
                    <td class="p-3 text-[10px] text-gray-600 text-right">${hora}</td>
                </tr>`;
            } else {
                return `<tr class="bg-red-950/20"><td class="p-3 text-red-500 font-mono text-xs">${item.game_id}</td><td class="p-3"><select onchange="vincularGameID(${item.game_id}, this.value)" class="bg-black border border-red-500/30 text-[10px] p-1 rounded w-full text-red-200"><option value="">❓ IDENTIFICAR...</option>${materialesLocales.map(m => `<option value="${m.id}">${m.nombre}</option>`).join('')}</select></td><td colspan="3"></td></tr>`;
            }
        }).join('');
    };

    elements.refresh?.addEventListener('click', loadData);
    loadData();
}

// FUNCIÓN DE HISTORIAL MENSUAL (Habilitada por click en tabla)
window.verHistorialMensual = async function(gameId, nombre) {
    const modal = document.getElementById('modal-grafico');
    modal.classList.remove('hidden');
    document.getElementById('grafico-titulo').textContent = `${nombre} - Historial 30 Días`;

    try {
        const res = await fetch(`/api/market-history-monthly/${gameId}`);
        const data = await res.json();
        const ctx = document.getElementById('canvas-monthly-detail').getContext('2d');
        
        if (detailChart) detailChart.destroy();
        detailChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.map(d => d.fecha),
                datasets: [
                    { label: 'Precio Mínimo', data: data.map(d => d.precio_min), borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', fill: true, tension: 0.3 },
                    { label: 'Precio Promedio', data: data.map(d => d.precio_avg), borderColor: '#a855f7', borderDash: [5, 5], tension: 0.3 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { labels: { color: '#fff' } } },
                scales: { y: { grid: { color: '#1f2937' }, ticks: { color: '#9ca3af' } }, x: { grid: { display: false }, ticks: { color: '#9ca3af' } } }
            }
        });
    } catch (err) { console.error(err); }
};

window.vincularGameID = async function(gameId, localId) {
    if (!localId || !confirm(`¿Vincular ID ${gameId}?`)) return;
    try {
        const res = await fetch(`/api/materiales/link-game-id/${localId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ game_id: gameId }) });
        if (res.ok) location.reload();
    } catch (e) {}
};