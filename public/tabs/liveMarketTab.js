let materialesLocales = [];
let globalChart = null;
let detailChart = null;
let marketDataFull = [];

export async function initMarketLiveTab(config = { mode: 'read' }) {
    const isAdmin = config.mode === 'admin';

    const elements = {
        status: document.getElementById('market-status'),
        tbody: document.getElementById('market-live-tbody'),
        metrics: document.getElementById('metrics-container'),
        sales: document.getElementById('sales-container'),
        refresh: document.getElementById('btn-refresh-market'),
        search: document.getElementById('market-search')
    };

    // --- RENDERIZADO DE MÉTRICAS ---
    const renderMetrics = (metrics) => {
        if (!elements.metrics) return;

        const sortedMetrics = [...metrics].sort((a, b) => 
        Number(a.desviacion_porcentaje) - Number(b.desviacion_porcentaje)
        );

        const totalActivity = sortedMetrics.reduce((acc, m) => 
        acc + Number(m.volume_cypx_24h || 0), 0
        );

        const volEl = document.getElementById('stat-volume');
        if (volEl) {
        volEl.textContent = `${totalActivity.toLocaleString()} CYPX`;
        volEl.title = "Total en CYPX de todas las ventas reales confirmadas en las últimas 24 horas (suma de todos los ítems)";
        }

        // Cartel explicativo fijo (se agrega solo una vez)
        if (!document.getElementById('metrics-help')) {
        const helpDiv = document.createElement('div');
        helpDiv.id = 'metrics-help';
        helpDiv.className = 'text-[11px] text-gray-300 bg-gray-900/50 p-3 rounded-lg mb-4 border border-gray-700/60 shadow-sm';
        helpDiv.innerHTML = `
            <strong>Guía rápida de las tarjetas</strong><br>
            • Muestran los 8 ítems más interesantes del mercado ahora.<br>
            • <span class="text-green-400">OPORTUNIDAD</span> = más barato que el promedio de ventas reales de hoy<br>
            • <span class="text-red-400">CARO</span> = más caro que lo que se vendió recientemente<br>
            • Pasá el mouse por encima de cualquier número o badge para ver qué significa.
        `;
        elements.metrics.parentNode.insertBefore(helpDiv, elements.metrics);
        }

        elements.metrics.innerHTML = sortedMetrics.slice(0, 8).map(m => {
        const pct = Number(m.desviacion_porcentaje);
        const isCheap = pct < -4;
        const isExpensive = pct > 6;
        const barWidth = Math.min(Math.abs(pct) * 1.8, 100);
        const barColor = isCheap ? 'bg-green-500' : isExpensive ? 'bg-red-500' : 'bg-amber-500';

        let badge = '';
        if (isCheap) {
            badge = `<span class="absolute top-2 right-2 bg-green-700/95 text-white text-[9px] px-2.5 py-1 rounded-full font-bold shadow cursor-help" title="Oportunidad detectada: este ítem está ${Math.abs(pct).toFixed(1)}% más barato que el precio promedio real de ventas de las últimas 24 horas. ¡Buena chance de compra!">OPORTUNIDAD</span>`;
        }
        if (isExpensive) {
            badge = `<span class="absolute top-2 right-2 bg-red-700/95 text-white text-[9px] px-2.5 py-1 rounded-full font-bold shadow cursor-help" title="Alerta: está ${pct.toFixed(1)}% más caro que el promedio de ventas reales de hoy. Podría ser buen momento para vender.">CARO</span>`;
        }

        return `
            <div class="relative bg-gray-900/70 border ${isCheap ? 'border-green-600/60' : isExpensive ? 'border-red-600/60' : 'border-gray-700/50'} p-4 rounded-xl overflow-hidden hover:border-purple-500/50 transition group shadow-md">
            ${badge}
            <div class="flex items-center gap-3 mb-3">
                <img src="${m.imagen_url}" class="w-10 h-10 object-contain rounded-md" title="Imagen del ítem en el juego">
                <div class="min-w-0">
                <h4 class="text-[10px] font-black text-gray-500 uppercase tracking-wider truncate" title="Nombre del ítem en Cyberverse">${m.nombre}</h4>
                <div class="text-2xl font-mono font-extrabold text-white leading-none" title="Precio más bajo que alguien ofrece ahora mismo en el mercado">${Number(m.current_min_price).toFixed(2)} CYPX</div>
                </div>
            </div>
            <div class="space-y-2 text-[9.5px] font-mono">
                <div class="flex justify-between items-center" title="Porcentaje de diferencia entre el precio actual mínimo y el promedio real de ventas de las últimas 24 horas">
                <span class="text-gray-400">Cambio vs ventas reales</span>
                <span class="${pct < 0 ? 'text-green-400' : 'text-red-400'} font-bold" title="Negativo = más barato | Positivo = más caro">
                    ${pct > 0 ? '+' : ''}${pct.toFixed(1)}%
                </span>
                </div>
                <div class="h-2 bg-gray-800 rounded-full overflow-hidden" title="Barra visual del cambio porcentual (más larga = más diferencia)">
                <div class="${barColor} h-full transition-all duration-700" style="width: ${barWidth}%"></div>
                </div>
                <div class="flex justify-between text-gray-400" title="Valor total en CYPX de las ventas confirmadas de este ítem en las últimas 24 horas">
                <span>Ventas reales 24h</span>
                <span class="text-cyan-300 font-medium">${Number(m.volume_cypx_24h || 0).toLocaleString()} CYPX</span>
                </div>
            </div>
            </div>`;
        }).join('');
    };

    // --- RENDERIZADO DE VENTAS ---
    const renderSalesData = (sales) => {
        const salesContainer = document.getElementById('sales-list') || elements.sales;
        if (!salesContainer) return;

        // Cartel explicativo para ventas
        if (!document.getElementById('sales-help') && sales.length > 0) {
        const helpDiv = document.createElement('div');
        helpDiv.id = 'sales-help';
        helpDiv.className = 'text-[11px] text-gray-300 bg-gray-900/50 p-3 rounded-lg mb-3 border border-gray-700/60 shadow-sm';
        helpDiv.innerHTML = `
            <strong>Ventas recientes destacadas</strong><br>
            • Lista de ventas confirmadas importantes.<br>
            • <span class="text-purple-400">WHALE</span> = ventas muy grandes (> 2500 CYPX).<br>
            • Pasá el mouse para ver detalles de cada venta.
        `;
        salesContainer.parentNode.insertBefore(helpDiv, salesContainer);
        }
        
        if (sales.length === 0) {
            salesContainer.innerHTML = `<div class="text-center text-gray-600 text-[10px] py-20 italic">No hay ventas destacadas recientes...</div>`;
            return;
        }
        
        salesContainer.innerHTML = sales.map(s => {
            const precio = Number(s.precio_venta) || 0;
            const cantidad = Number(s.volumen_vendido) || 0;
            const totalVenta = (cantidad * precio).toFixed(0);
            
            const fechaObj = s.ultima_venta ? new Date(s.ultima_venta) : null;
            const horaVenta = fechaObj 
                ? fechaObj.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) 
                : '--/-- --:--';

            const isWhale = Number(totalVenta) > 2500;
            const containerClass = isWhale 
                ? 'border-purple-500 bg-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.3)] animate-pulse border-l-4' 
                : 'border-cyan-500/30 bg-gray-900/40 border-l-2';

            return `
                <div class="group ${containerClass} p-3 rounded-r-lg mb-2 flex items-center gap-3 transition-all cursor-help" title="Venta confirmada: ${cantidad} unidades de ${s.nombre} a ${precio} CYPX cada una = ${totalVenta} CYPX total">
                    <div class="relative flex-shrink-0">
                        <img src="${s.imagen_url}" class="w-9 h-9 object-contain ${isWhale ? 'scale-110' : 'opacity-80'} group-hover:opacity-100 transition" title="Ítem vendido">
                        ${isWhale ? '<span class="absolute -top-2 -left-2 text-[12px]" title="Venta grande (whale)">🐋</span>' : ''}
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex justify-between items-start mb-1">
                            <span class="text-[10px] font-mono ${isWhale ? 'text-purple-400 font-black' : 'text-cyan-400 font-bold'}" title="${isWhale ? 'Venta whale (>2500 CYPX)' : 'Venta normal'}">
                                ${isWhale ? 'WHALE: ' : ''}${totalVenta} CYPX
                            </span>
                            <span class="text-[9px] text-gray-500 font-mono" title="Fecha y hora exacta en que se detectó la venta">${horaVenta}</span>
                        </div>
                        <div class="flex justify-between items-center">
                            <div class="text-[10px] text-gray-100 font-bold truncate pr-2" title="Nombre del ítem vendido">${s.nombre}</div>
                            <div class="text-[10px] text-white font-mono bg-black/40 px-2 py-0.5 rounded" title="Cantidad vendida en esta transacción">x${cantidad}</div>
                        </div>
                    </div>
                </div>`;
        }).join('');
    };

    // --- RENDERIZADO DE FILAS (tabla principal) ---
    const renderRows = (data, liquidityData = []) => {
        if (!elements.tbody) return;

        // Cartel explicativo para la tabla
        if (!document.getElementById('table-help')) {
        const helpDiv = document.createElement('div');
        helpDiv.id = 'table-help';
        helpDiv.className = 'text-[11px] text-gray-300 bg-gray-900/50 p-3 rounded-lg mb-3 border border-gray-700/60 shadow-sm';
        helpDiv.innerHTML = `
            <strong>Tabla de ofertas activas</strong><br>
            • Lista de ítems que alguien está vendiendo ahora mismo.<br>
            • Click en el nombre → ves el gráfico de precios de los últimos 30 días.<br>
            • <strong>[🔥 RECIÉN]</strong> = oferta muy nueva y fresca.<br>
            • Pasá el mouse por cualquier celda para ver qué significa.
        `;
        elements.tbody.parentNode.parentNode.insertBefore(helpDiv, elements.tbody.parentNode);
        }
        
        elements.tbody.innerHTML = data.map(item => {
            const fechaFull = new Date(item.listed_at).toLocaleString('es-AR', { 
                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' 
            });
            const precio = Number(item.price).toFixed(2);
            
            const liq = liquidityData.find(l => l.game_id === item.game_id);
            let liqHTML = '';
            
            if (liq) {
                const min = Math.round(liq.minutos_desde_ultima);
                const color = min < 15 ? 'text-green-400' : (min < 60 ? 'text-yellow-500' : 'text-gray-600');
                const label = min < 1 ? 'RECIÉN' : `${min}m`;
                liqHTML = `<span class="${color} text-[9px] font-black tracking-tighter" title="Tiempo desde la última vez que se vio esta oferta actualizada">🔥 ${label}</span>`;
            } else {
                liqHTML = `<span class="text-gray-800 text-[9px] font-mono" title="Oferta antigua o sin actualización reciente en los últimos snapshots">[STALE]</span>`;
            }

            if (item.nombre) {
                return `
                <tr class="hover:bg-white/5 transition border-b border-gray-800/50 group cursor-help" title="Oferta activa de ${item.nombre}: ${item.amount} unidades a ${precio} CYPX cada una">
                    <td class="p-3 font-mono text-cyan-700 text-[10px]" title="ID único del ítem dentro del juego">${item.game_id}</td>
                    <td class="p-3 cursor-pointer group-hover:bg-white/[0.02]" onclick="verHistorialMensual(${item.game_id}, '${item.nombre}')">
                        <div class="flex items-center gap-2">
                            <img src="${item.imagen_url}" class="w-6 h-6 object-contain" title="Imagen del ítem">
                            <div class="flex flex-col leading-tight">
                                <span class="text-sm text-gray-200 font-bold group-hover:text-purple-400 transition" title="Click aquí para ver el gráfico de precios históricos de este ítem (últimos 30 días)">${item.nombre}</span>
                                ${liqHTML}
                            </div>
                        </div>
                    </td>
                    <td class="p-3 font-mono text-green-400 font-bold text-base" title="Precio unitario más bajo de esta oferta actual">${precio} CYPX</td>
                    <td class="p-3 text-xs text-gray-500 font-mono" title="Cantidad total disponible en esta oferta/listado">${item.amount} unidades</td>
                    <td class="p-3 text-[10px] text-gray-600 text-right font-mono" title="Fecha y hora en que se publicó esta oferta">${fechaFull}</td>
                </tr>`;
            } 

            const selector = isAdmin ? `
                <select onchange="vincularGameID(${item.game_id}, this.value)" 
                        class="bg-black text-[9px] border border-red-500/30 rounded p-1 w-full text-red-200 outline-none" title="Selecciona el ítem correspondiente para vincular este game_id">
                    <option value="">❓ VINCULAR...</option>
                    ${materialesLocales.map(m => `<option value="${m.id}">${m.nombre}</option>`).join('')}
                </select>
            ` : `<span class="text-[9px] text-red-900 font-black" title="Este ID de juego aún no está asociado a ningún ítem conocido en la base">UNKNOWN_ID</span>`;

            return `
            <tr class="bg-red-500/5 border-b border-red-900/20 opacity-70" title="Oferta sin ítem vinculado (solo visible en modo administrador)">
                <td class="p-3 font-mono text-red-500 text-[10px]">${item.game_id}</td>
                <td class="p-3">${selector}</td>
                <td class="p-3 font-mono text-red-400/80 font-bold" title="Precio de la oferta no vinculada">${precio} CYPX</td>
                <td class="p-3 text-xs text-red-300/50" title="Cantidad en esta oferta">${item.amount}</td>
                <td class="p-3 text-[10px] text-gray-800 text-right font-mono">${fechaFull}</td>
            </tr>`;
        }).join('');
    };

    // --- CARGA DE DATOS ---
    const loadData = async () => {
        if (elements.status) elements.status.textContent = 'SYNCING...';
        try {
            const [resMats, resMetrics, resMarket, resSales, resLiq] = await Promise.all([
                fetch('/api/materiales').then(r => r.json()),
                fetch('/api/market-metrics').then(r => r.json()),
                fetch('/api/market-live').then(r => r.json()),
                fetch('/api/market-sales-tracker').then(r => r.json()),
                fetch('/api/market-liquidity').then(r => r.json())
            ]);

            materialesLocales = resMats;
            marketDataFull = resMarket;

            renderMetrics(resMetrics);
            renderRows(resMarket, resLiq);
            renderSalesData(resSales);

            if (elements.status) elements.status.textContent = `LIVE | ${new Date().toLocaleTimeString('es-AR')}`;
        } catch (err) {
            console.error(err);
            if (elements.status) elements.status.textContent = 'LINK ERROR';
        }
    };

    // --- EVENTOS ---
    elements.search?.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase().trim();
        if (!term) {
            renderRows(marketDataFull);
            return;
        }
        const filtered = marketDataFull.filter(item => {
            const nombre = (item.nombre || "").toLowerCase();
            const id = (item.game_id || "").toString();
            return nombre.includes(term) || id.includes(term);
        });
        renderRows(filtered);
    });

    elements.refresh?.addEventListener('click', loadData);
    
    loadData();
}

// --- FUNCIONES GLOBALES (FUERA DE LA PESTAÑA) ---

window.verHistorialMensual = async function(gameId, nombre) {
    const modal = document.getElementById('modal-grafico');
    modal.classList.remove('hidden');
    document.getElementById('grafico-titulo').textContent = `${nombre} - Historial 30 Días`;

    try {
        const res = await fetch(`/api/market-history-monthly/${gameId}`);
        const data = await res.json();
        
        const precioBase = data.length > 0 ? Number(data[0].precio_base) : 0;
        const targetTarea = precioBase * 1.4;

        const ctx = document.getElementById('canvas-monthly-detail').getContext('2d');
        if (detailChart) detailChart.destroy();
        
        detailChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.map(d => d.fecha),
                datasets: [
                    { label: 'Precio Mínimo', data: data.map(d => d.precio_min), borderColor: '#10b981', fill: true, backgroundColor: 'rgba(16, 185, 129, 0.1)', tension: 0.3 },
                    { label: `Límite Tarea (140%): ${targetTarea.toFixed(2)}`, data: data.map(() => targetTarea), borderColor: '#f59e0b', borderDash: [10, 5], pointRadius: 0, fill: false },
                    { label: 'Promedio Market', data: data.map(d => d.precio_avg), borderColor: '#a855f7', borderDash: [3, 3], fill: false }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { labels: { color: '#9ca3af' } } },
                scales: { 
                    y: { grid: { color: '#1f2937' }, ticks: { color: '#9ca3af' }, suggestedMax: targetTarea * 1.1 }, 
                    x: { ticks: { color: '#9ca3af' } } 
                }
            }
        });
    } catch (err) { console.error(err); }
};

window.vincularGameID = async function(gameId, localId) {
    if (!localId || !confirm(`¿Vincular ID ${gameId}?`)) return;
    try {
        const res = await fetch(`/api/materiales/link-game-id/${localId}`, { 
            method: 'PUT', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ game_id: gameId }) 
        });
        if (res.ok) location.reload();
    } catch (e) {}
};