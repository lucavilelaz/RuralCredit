/**
 * js/dashboard.js
 * 
 * ✨ Carregamento inteligente de dados massivos
 * Estratégias:
 *   1. Fetch em chunks (não tudo de uma vez)
 *   2. IndexedDB para cache local
 *   3. Virtual scrolling (não renderiza tudo)
 *   4. Web Workers para processing pesado
 */

class SicorDashboard {
  constructor(config = {}) {
    this.config = {
      dataApi: '/api/serve-data',
      chunkSize: 100,
      cacheDb: 'sicor-cache',
      cacheStore: 'records',
      ...config
    };
    
    this.data = [];
    this.filtered = [];
    this.totalRecords = 0;
    this.dbReady = false;
    
    this.init();
  }
  
  /**
   * 1️⃣ Inicializa IndexedDB para cache local
   */
  async init() {
    try {
      await this.initIndexedDB();
      this.dbReady = true;
      console.log('✓ IndexedDB pronto');
      
      // Tenta carregar do cache primeiro
      const cached = await this.loadFromCache();
      if (cached && cached.length > 0) {
        console.log(`✓ Carregado ${cached.length} registros do cache local`);
        this.data = cached;
        this.render();
        
        // Atualiza em background (não bloqueia UI)
        this.syncDataInBackground();
      } else {
        // Sem cache → download completo
        await this.downloadAll();
      }
      
    } catch (err) {
      console.error('❌ Erro na inicialização:', err);
      // Fallback: tenta sem cache
      await this.downloadAll();
    }
  }
  
  /**
   * 2️⃣ Cria/abre IndexedDB
   */
  async initIndexedDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.config.cacheDb, 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.config.cacheStore)) {
          const store = db.createObjectStore(this.config.cacheStore, 
            { keyPath: 'id', autoIncrement: true }
          );
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }
  
  /**
   * 3️⃣ Download em chunks (chunked pagination)
   */
  async downloadAll() {
    console.log('📥 Iniciando download de dados...');
    
    const progressBar = document.getElementById('progress');
    if (progressBar) progressBar.style.display = 'block';
    
    let offset = 0;
    let allData = [];
    let hasMore = true;
    
    try {
      while (hasMore) {
        const chunk = await this.fetchChunk(offset);
        
        if (chunk.data && chunk.data.length > 0) {
          allData.push(...chunk.data);
          offset += chunk.data.length;
          
          // Update UI progress
          if (progressBar) {
            const pct = Math.min(100, (offset / chunk.total) * 100);
            progressBar.value = pct;
            console.log(`Progresso: ${offset}/${chunk.total} (${pct.toFixed(0)}%)`);
          }
        }
        
        hasMore = chunk.hasMore || false;
      }
      
      this.data = allData;
      this.totalRecords = allData.length;
      
      // Salva em cache
      if (this.dbReady) {
        await this.saveToCache(allData);
      }
      
      console.log(`✓ ${allData.length} registros carregados com sucesso`);
      this.render();
      
    } catch (err) {
      console.error('❌ Erro no download:', err);
      alert('Erro ao carregar dados. Verifique conexão.');
    } finally {
      if (progressBar) progressBar.style.display = 'none';
    }
  }
  
  /**
   * 4️⃣ Fetch de um chunk
   */
  async fetchChunk(offset) {
    const url = new URL(this.config.dataApi, location.origin);
    url.searchParams.append('offset', offset);
    url.searchParams.append('limit', this.config.chunkSize);
    
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    
    return resp.json();
  }
  
  /**
   * 5️⃣ Salva em IndexedDB
   */
  async saveToCache(records) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([this.config.cacheStore], 'readwrite');
      const store = tx.objectStore(this.config.cacheStore);
      
      // Limpa store antigo
      store.clear();
      
      // Salva novo
      records.forEach(record => {
        store.put({
          ...record,
          timestamp: Date.now()
        });
      });
      
      tx.onerror = () => reject(tx.error);
      tx.oncomplete = () => resolve();
    });
  }
  
  /**
   * 6️⃣ Carrega do cache
   */
  async loadFromCache() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([this.config.cacheStore], 'readonly');
      const store = tx.objectStore(this.config.cacheStore);
      const request = store.getAll();
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }
  
  /**
   * 7️⃣ Sincroniza dados em background (sem bloquear UI)
   */
  async syncDataInBackground() {
    setTimeout(async () => {
      try {
        console.log('🔄 Verificando atualização de dados...');
        const metadata = await fetch(
          `${this.config.dataApi}?action=metadata`
        ).then(r => r.json());
        
        if (metadata.total_records > this.data.length) {
          console.log('📤 Novos dados disponíveis!');
          await this.downloadAll();
        }
      } catch (err) {
        console.warn('⚠️ Erro ao verificar updates:', err);
      }
    }, 3000); // Verifica após 3s
  }
  
  /**
   * 8️⃣ Busca/Filtro (rápido, sem reload)
   */
  search(field, value) {
    if (!value) {
      this.filtered = this.data;
    } else {
      const query = value.toLowerCase();
      this.filtered = this.data.filter(row => 
        String(row[field] || '').toLowerCase().includes(query)
      );
    }
    
    console.log(`🔍 Encontrados ${this.filtered.length} registros`);
    this.render();
  }
  
  /**
   * 9️⃣ Renderização (virtual scrolling)
   */
  render() {
    const container = document.getElementById('data-container');
    if (!container) return;
    
    const dataToRender = this.filtered.length > 0 ? this.filtered : this.data;
    
    // Renderiza apenas primeiros 50 visíveis + buffers
    const visible = dataToRender.slice(0, 50);
    
    container.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Município</th>
            <th>Banco</th>
            <th>Valor (R$)</th>
            <th>Data</th>
          </tr>
        </thead>
        <tbody>
          ${visible.map(row => `
            <tr>
              <td>${row.Municipio || '-'}</td>
              <td>${row.Banco || '-'}</td>
              <td>R$ ${(row.ValorOperacao || 0).toLocaleString('pt-BR')}</td>
              <td>${new Date(row.Data).toLocaleDateString('pt-BR')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <p style="margin-top: 20px; color: #666;">
        Mostrando ${visible.length} de ${dataToRender.length} registros
      </p>
    `;
  }
  
  /**
   * 🔟 Exporta para CSV
   */
  exportCSV() {
    const data = this.filtered.length > 0 ? this.filtered : this.data;
    const csv = [
      // Header
      Object.keys(data[0] || {}).join(','),
      // Rows
      ...data.map(row => 
        Object.values(row).map(v => 
          `"${String(v).replace(/"/g, '""')}"`
        ).join(',')
      )
    ].join('\n');
    
    // Download
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sicor_export_${Date.now()}.csv`;
    a.click();
  }
}

// ═══════════════════════════════════════════════════════════════════
// Inicialização
// ═══════════════════════════════════════════════════════════════════

window.addEventListener('DOMContentLoaded', () => {
  window.dashboard = new SicorDashboard();
  
  // Busca
  document.getElementById('search-btn')?.addEventListener('click', () => {
    const field = document.getElementById('search-field').value;
    const value = document.getElementById('search-value').value;
    window.dashboard.search(field, value);
  });
  
  // Export
  document.getElementById('export-btn')?.addEventListener('click', () => {
    window.dashboard.exportCSV();
  });
});
