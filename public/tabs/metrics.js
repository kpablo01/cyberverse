async function renderMetrics() {
    const res = await fetch('/api/market-metrics');
    const metrics = await res.json();
    
    const container = document.getElementById('metrics-container'); // Crea este div en tu HTML
    container.innerHTML = metrics.map(m => {
        const color = m.desviacion_porcentaje < 0 ? 'text-green-400' : 'text-red-400';
        const icono = m.desviacion_porcentaje < 0 ? '▼' : '▲';
        
        return `
            <div class="panel-cyber p-4 border-l-4 ${m.desviacion_porcentaje < -10 ? 'border-green-500' : 'border-purple-500'}">
                <div class="flex justify-between items-center">
                    <div class="flex items-center gap-3">
                        <img src="${m.imagen_url}" class="w-8 h-8">
                        <div>
                            <h4 class="font-bold">${m.nombre}</h4>
                            <p class="text-[10px] text-gray-400">24h Avg: ${Number(m.avg_price_24h).toFixed(2)}</p>
                        </div>
                    </div>
                    <div class="text-right">
                        <div class="text-lg font-mono font-bold">${Number(m.current_min_price).toFixed(2)}</div>
                        <div class="${color} text-xs font-bold">
                            ${icono} ${Math.abs(m.desviacion_porcentaje).toFixed(1)}%
                        </div>
                    </div>
                </div>
                ${m.desviacion_porcentaje < -15 ? '<div class="mt-2 text-[10px] bg-green-900/50 text-green-300 p-1 text-center animate-pulse">¡OPORTUNIDAD DE COMPRA!</div>' : ''}
            </div>
        `;
    }).join('');
}