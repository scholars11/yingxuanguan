/*
 * source-manager.js - 数据源管理弹窗
 * 用于在任意页面打开弹窗，添加/编辑/删除/切换数据源
 * 用户在页面操作，不需要修改代码
 */

const SourceManager = {
  init() {
    if (document.getElementById('sourceModal')) return;
    const modal = document.createElement('div');
    modal.id = 'sourceModal';
    modal.className = 'modal-mask';
    modal.innerHTML = `
      <div class="modal-box">
        <div class="modal-header">
          <h3>数据源管理</h3>
          <button class="modal-close" onclick="SourceManager.close()">×</button>
        </div>
        <div class="modal-body">
          <div class="source-toolbar">
            <button class="btn btn-primary" onclick="SourceManager.openEditor()">+ 添加数据源</button>
            <button class="btn" onclick="SourceManager.testAll()">测试连通性</button>
          </div>
          <div style="margin:12px 0;padding:10px;border:1px solid var(--c-border,#2a2e36);border-radius:8px;background:rgba(255,255,255,0.02);">
            <label style="display:block;font-size:13px;margin-bottom:6px;">服务器地址（手机 / TV 版填写，电脑版留空）</label>
            <div style="display:flex;gap:8px;">
              <input type="text" id="proxyBaseInput" placeholder="如：https://yingxuanguan.onrender.com"
                     style="flex:1;min-width:0;background:#16181d;border:1px solid var(--c-border,#2a2e36);border-radius:6px;color:inherit;padding:7px 10px;font-size:13px;">
              <button class="btn btn-sm btn-primary" onclick="SourceManager.saveProxy()">保存</button>
            </div>
            <small style="display:block;margin-top:6px;color:var(--c-text-mute,#8a8f99);">手机和电视无法运行内置代理，需填写已部署的公网服务地址；留空则使用当前网站地址。</small>
          </div>
          <div id="sourceList" class="source-list"></div>
        </div>
        <div class="modal-footer">
          <button class="btn" onclick="SourceManager.close()">关闭</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const editor = document.createElement('div');
    editor.id = 'sourceEditor';
    editor.className = 'modal-mask';
    editor.innerHTML = `
      <div class="modal-box">
        <div class="modal-header">
          <h3 id="editorTitle">添加数据源</h3>
          <button class="modal-close" onclick="SourceManager.closeEditor()">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>名称</label>
            <input type="text" id="srcName" placeholder="如：视频源1" maxlength="50">
          </div>
          <div class="form-group">
            <label>API 接口地址</label>
            <input type="text" id="srcUrl" placeholder="如：https://api.example.com/api.php/provide/vod/">
            <small>支持苹果CMS V10 标准采集接口，地址通常以 /api.php/provide/vod/ 结尾</small>
          </div>
          <div class="form-group">
            <label><input type="checkbox" id="srcEnabled" checked> 启用</label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn" onclick="SourceManager.closeEditor()">取消</button>
          <button class="btn btn-primary" onclick="SourceManager.saveSource()">保存</button>
        </div>
      </div>
    `;
    document.body.appendChild(editor);
  },

  open() {
    this.init();
    this.renderList();
    const proxyInput = document.getElementById('proxyBaseInput');
    if (proxyInput) proxyInput.value = Config.getProxyBase();
    document.getElementById('sourceModal').classList.add('show');
  },

  saveProxy() {
    const input = document.getElementById('proxyBaseInput');
    const v = input.value.trim();
    if (v && !/^https?:\/\//.test(v)) {
      Common.toast('地址需以 http:// 或 https:// 开头');
      return;
    }
    Config.setProxyBase(v);
    Common.toast(v ? '服务器地址已保存' : '已恢复默认（当前网站地址）');
    if (window.onSourcesChanged) window.onSourcesChanged();
  },

  close() {
    document.getElementById('sourceModal').classList.remove('show');
  },

  openEditor(source) {
    const editor = document.getElementById('sourceEditor');
    const title = document.getElementById('editorTitle');
    const nameInput = document.getElementById('srcName');
    const urlInput = document.getElementById('srcUrl');
    const enabledInput = document.getElementById('srcEnabled');

    if (source) {
      title.textContent = '编辑数据源';
      nameInput.value = source.name;
      urlInput.value = source.url;
      enabledInput.checked = source.enabled;
      editor.dataset.editId = source.id;
    } else {
      title.textContent = '添加数据源';
      nameInput.value = '';
      urlInput.value = '';
      enabledInput.checked = true;
      delete editor.dataset.editId;
    }
    editor.classList.add('show');
  },

  closeEditor() {
    document.getElementById('sourceEditor').classList.remove('show');
  },

  saveSource() {
    const editor = document.getElementById('sourceEditor');
    const name = document.getElementById('srcName').value.trim();
    const url = document.getElementById('srcUrl').value.trim();
    const enabled = document.getElementById('srcEnabled').checked;

    if (!name) { Common.toast('请输入名称'); return; }
    if (!url) { Common.toast('请输入API地址'); return; }
    if (!/^https?:\/\//.test(url)) { Common.toast('地址必须以 http:// 或 https:// 开头'); return; }

    const editId = editor.dataset.editId;
    const source = {
      id: editId || Config.genId(),
      name, url, enabled,
    };
    Config.upsertSource(source);
    if (!Config.getCurrentSource()) {
      Config.setCurrentSource(source.id);
    }
    this.renderList();
    this.closeEditor();
    Common.toast('保存成功');

    // 若是新增或切换，触发回调
    if (window.onSourcesChanged) window.onSourcesChanged();
  },

  deleteSource(id) {
    const sources = Config.getSources();
    if (sources.length <= 1) {
      Common.toast('至少保留一个数据源');
      return;
    }
    if (!Common.confirm('确定删除该数据源？')) return;
    Config.deleteSource(id);
    this.renderList();
    Common.toast('已删除');
    if (window.onSourcesChanged) window.onSourcesChanged();
  },

  setCurrent(id) {
    Config.setCurrentSource(id);
    this.renderList();
    // 立即更新首页"当前数据源"显示，不等异步刷新
    const cur = Config.getCurrentSource();
    const nameEl = document.getElementById('currentSourceName');
    if (nameEl && cur) nameEl.textContent = cur.name;
    Common.toast('已切换数据源');
    if (window.onSourcesChanged) window.onSourcesChanged();
  },

  async testSource(id) {
    const sources = Config.getSources();
    const src = sources.find(s => s.id === id);
    if (!src) return;
    const btn = document.querySelector('[data-test="' + id + '"]');
    if (btn) { btn.disabled = true; btn.textContent = '测试中...'; }
    try {
      const base = Api.normalizeBase(src.url);
      const u = new URL(base);
      u.searchParams.set('ac', 'list');
      u.searchParams.set('pg', '1');
      const data = await Api.request(u.toString());
      if (data && data.code === 1) {
        Common.toast('✓ ' + src.name + ' 连通正常，共 ' + (data.total || 0) + ' 条');
      } else {
        Common.toast('× ' + src.name + ' 返回异常');
      }
    } catch (e) {
      Common.toast('× ' + src.name + ' 连接失败：' + e.message);
    }
    if (btn) { btn.disabled = false; btn.textContent = '测试'; }
  },

  async testAll() {
    const sources = Config.getSources();
    for (const s of sources) {
      await this.testSource(s.id);
    }
  },

  renderList() {
    const list = document.getElementById('sourceList');
    if (!list) return;
    const sources = Config.getSources();
    const currentId = (Config.getCurrentSource() || {}).id;
    if (sources.length === 0) {
      list.innerHTML = '<div class="empty">还没有数据源，点击上方"添加数据源"</div>';
      return;
    }
    list.innerHTML = sources.map(s => `
      <div class="source-item ${s.id === currentId ? 'current' : ''} ${!s.enabled ? 'disabled' : ''}">
        <div class="source-info">
          <div class="source-name">${Common.escape(s.name)} ${s.id === currentId ? '<span class="badge">当前</span>' : ''} ${!s.enabled ? '<span class="badge badge-gray">已禁用</span>' : ''}</div>
          <div class="source-url" title="${Common.escape(s.url)}">${Common.escape(s.url)}</div>
        </div>
        <div class="source-actions">
          ${s.enabled && s.id !== currentId ? `<button class="btn btn-sm btn-primary" onclick="SourceManager.setCurrent('${s.id}')">切换</button>` : ''}
          <button class="btn btn-sm" data-test="${s.id}" onclick="SourceManager.testSource('${s.id}')">测试</button>
          <button class="btn btn-sm" onclick="SourceManager.openEditor(${JSON.stringify(s).replace(/"/g,'&quot;')})">编辑</button>
          <button class="btn btn-sm btn-danger" onclick="SourceManager.deleteSource('${s.id}')">删除</button>
        </div>
      </div>
    `).join('');
  },
};

window.SourceManager = SourceManager;
