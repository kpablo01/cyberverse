import { initMarketTab } from '../tabs/marketTab.js';
import { initOrdersTab } from '../tabs/ordersTab.js';
import { initCraftingTab } from '../tabs/craftingTab.js';
import { initTooltip } from '../components/tooltip.js';
import { initMarketLiveTab } from '../tabs/liveMarketTab.js';

// Globales mínimas (o las podés pasar como parámetro después)
let allMaterials = [];

function switchTab(tabId) {
  const tabs = document.querySelectorAll('.tab-content');
  const buttons = document.querySelectorAll('.tab-btn');

  if (!tabs.length || !buttons.length) {
      console.warn('No se encontraron tabs o botones en el DOM');
      return;
  }

  tabs.forEach(t => t.classList.add('hidden'));
  buttons.forEach(b => b.classList.remove('active-tab'));

  const targetTab = document.getElementById(tabId);
  if (targetTab) {
      targetTab.classList.remove('hidden');
  } else {
      console.error(`Tab no encontrado: ${tabId}`);
  }

  const btn = document.getElementById(`btn-${tabId.replace('tab-', '')}`);
  if (btn) {
      btn.classList.add('active-tab');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // Tooltip debe estar listo desde el principio
  initTooltip();

  // Carga inicial de datos compartidos
  const res = await fetch('/api/materiales');
  allMaterials = await res.json();

  // Inicializamos cada pestaña (pueden cargar sus datos cuando se muestren)
  // Inicializar tabs (pueden fallar silenciosamente si el DOM no está)
  initMarketTab().catch(err => console.error('Market init falló:', err));
  initOrdersTab().catch(err => console.error('Orders init falló:', err));
  initCraftingTab().catch(err => console.error('Crafting init falló:', err));
  initMarketLiveTab().catch(err => console.error('Live Market init falló:', err));

  // Manejo de tabs con event listeners (mejor que onclick inline)
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tabName = btn.id.replace('btn-', '');           // market / pedidos / crafteo
        const tabId = `tab-${tabName}`;
        switchTab(tabId);
    });
  });

  // Abrir por default
  switchTab('tab-market');
  });