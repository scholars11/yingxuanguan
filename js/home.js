/*
 * home.js - 首页逻辑
 * 功能：分类导航、视频列表、分页、搜索、异步海报加载
 */

const Home = {
  // 父分类关键词（完全匹配才识别为父分类，会做合并查询）
  // 苹果CMS V10 站点：父分类本身没有视频，视频绑定在子分类上
  PARENT_PATTERNS: [
    { name: '电影', suffixes: ['片', '电影'] },
    { name: '电视剧', suffixes: ['剧'] },
    { name: '综艺', suffixes: ['综艺'] },
    { name: '动漫', suffixes: ['动漫', '动画'] },
    { name: '动画', suffixes: ['动漫', '动画'] },
    { name: '纪录片', suffixes: ['纪录'] },
    { name: '体育', suffixes: ['体育', '篮球', '足球', '斯诺克'] },
    { name: '短剧', suffixes: ['短剧'] },
  ],

  state: {
    page: 1,
    total: 0,
    pagecount: 1,
    limit: 20,
    currentCategory: '',
    keyword: '',
    categories: [],         // 全部分类（含父分类）
    displayCategories: [],  // 显示用分类（父分类也会保留作为入口）
    parentChildren: null,   // 当前点击父分类时，其子分类ID列表
    loadedIds: new Set(),
  },

  // 识别是否为父分类
  isParentCategory(cat) {
    if (!cat || !cat.type_name) return false;
    return this.PARENT_PATTERNS.some(p => p.name === cat.type_name);
  },

  // 找父分类的所有子分类
  findChildren(parentCat, allCats) {
    const pattern = this.PARENT_PATTERNS.find(p => p.name === parentCat.type_name);
    if (!pattern) return [parentCat];
    // 子分类：type_name 以指定后缀结尾，且 type_id 不同
    let children = allCats.filter(c => {
      if (String(c.type_id) === String(parentCat.type_id)) return false;
      return pattern.suffixes.some(suf => c.type_name && c.type_name.endsWith(suf));
    });
    // 子分类的 type_name 不能与父分类相同（避免"电影"匹配"电影"）
    children = children.filter(c => c.type_name !== parentCat.type_name);
    return children.length > 0 ? children : [parentCat];
  },

  async init() {
    this.bindEvents();
    // 渲染观看历史
    if (window.WatchHistory) WatchHistory.renderHome();
    this.checkSourceAndLoad();
  },

  bindEvents() {
    // 搜索回车
    const input = document.getElementById('searchInput');
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          this.doSearch();
        }
      });
    }
    // URL 参数
    const wd = Common.getParam('wd');
    if (wd) {
      input.value = wd;
      this.state.keyword = wd;
    }
    const t = Common.getParam('t');
    if (t) this.state.currentCategory = t;
    const pg = Common.getParam('pg');
    if (pg) this.state.page = parseInt(pg) || 1;
  },

  // 检查数据源并加载
  checkSourceAndLoad() {
    const src = Config.getCurrentSource();
    const nameEl = document.getElementById('currentSourceName');
    if (nameEl) {
      nameEl.textContent = src ? src.name : '未配置';
    }
    if (!src) {
      // 没有数据源，引导用户
      document.getElementById('videoList').innerHTML = `
        <div class="empty" style="grid-column:1/-1;">
          <div class="icon">⚙</div>
          <div>还未配置数据源</div>
          <div style="margin-top:8px;font-size:13px;">点击右上角 ⚙ 添加数据源即可开始使用</div>
          <button class="btn btn-primary" style="margin-top:14px;" onclick="SourceManager.open()">立即添加</button>
        </div>
      `;
      return;
    }
    this.loadCategories();
    this.loadList();
  },

  // 数据源变更回调
  onSourceChanged() {
    this.state.page = 1;
    this.state.currentCategory = '';
    this.state.keyword = '';
    this.state.parentChildren = null;
    this.state.loadedIds.clear();
    const input = document.getElementById('searchInput');
    if (input) input.value = '';
    // 部分 WebView（file:// 等）下 replaceState 会抛安全异常，不能阻断后续刷新
    try {
      history.replaceState(null, '', location.pathname);
    } catch (e) {}
    this.checkSourceAndLoad();
  },

  // 重试：同时重新加载分类和列表（分类首次失败后不能一直缺失）
  retryAll() {
    this.loadCategories();
    this.loadList();
  },

  // 加载分类
  async loadCategories() {
    try {
      const data = await Api.getList({ pg: 1 });
      const classArr = data.class || [];
      this.state.categories = classArr;
      this.renderCategories();
    } catch (e) {
      console.warn('加载分类失败', e);
    }
  },

  renderCategories() {
    const nav = document.getElementById('categoryNav');
    if (!nav) return;
    const cats = [{ type_id: '', type_name: '全部' }].concat(this.state.categories);
    nav.innerHTML = cats.map(c => `
      <span class="category-chip ${c.type_id === this.state.currentCategory ? 'active' : ''}"
            data-t="${c.type_id}"
            onclick="Home.selectCategory('${c.type_id}')">${Common.escape(c.type_name)}</span>
    `).join('');
  },

  selectCategory(t) {
    if (this.state.currentCategory === t && this.state.page === 1) return;
    this.state.currentCategory = t;
    this.state.page = 1;
    this.state.keyword = '';
    const input = document.getElementById('searchInput');
    if (input) input.value = '';

    // 检测是否是父分类，做合并查询
    const cat = this.state.categories.find(c => String(c.type_id) === String(t));
    if (cat && this.isParentCategory(cat)) {
      const children = this.findChildren(cat, this.state.categories);
      this.state.parentChildren = children.map(c => c.type_id);
    } else {
      this.state.parentChildren = null;
    }

    this.renderCategories();
    this.loadList();
    this.scrollToTop();
  },

  doSearch() {
    const input = document.getElementById('searchInput');
    const kw = (input.value || '').trim();
    this.state.keyword = kw;
    this.state.page = 1;
    this.state.currentCategory = '';
    this.state.parentChildren = null;
    this.renderCategories();
    this.loadList();
    this.scrollToTop();
  },

  scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  // 加载视频列表
  async loadList() {
    const listEl = document.getElementById('videoList');
    const emptyEl = document.getElementById('emptyState');
    const errorEl = document.getElementById('errorState');
    const pagEl = document.getElementById('pagination');

    listEl.innerHTML = this.renderSkeleton();
    emptyEl.style.display = 'none';
    errorEl.style.display = 'none';
    pagEl.style.display = 'none';

    // 更新标题
    const titleEl = document.getElementById('listTitle');
    const subEl = document.getElementById('listSub');
    if (this.state.keyword) {
      titleEl.childNodes[0].nodeValue = '搜索：' + this.state.keyword;
      subEl.textContent = '';
    } else if (this.state.currentCategory) {
      const cat = this.state.categories.find(c => String(c.type_id) === String(this.state.currentCategory));
      titleEl.childNodes[0].nodeValue = (cat ? cat.type_name : '分类') + ' ';
      if (this.state.parentChildren) {
        subEl.textContent = '合并 ' + this.state.parentChildren.length + ' 个子分类';
      } else {
        subEl.textContent = '';
      }
    } else {
      titleEl.childNodes[0].nodeValue = '最新影视 ';
      subEl.textContent = '';
    }

    try {
      // 父分类合并查询：并发请求所有子分类的当前页，按时间合并后取20条
      if (this.state.parentChildren && this.state.parentChildren.length > 0) {
        const childIds = this.state.parentChildren;
        const page = this.state.page;
        const pageSize = 20;

        // 并发请求每个子分类的当前页
        const promises = childIds.map(t =>
          Api.getList({ t, pg: page }).catch(() => ({ list: [], total: 0 }))
        );
        const results = await Promise.all(promises);

        // 合并所有视频，去重，按更新时间倒序
        const seen = new Set();
        let all = [];
        let totalSum = 0;
        results.forEach(d => {
          totalSum += (parseInt(d.total) || 0);
          (d.list || []).forEach(item => {
            if (item.vod_id && !seen.has(item.vod_id)) {
              seen.add(item.vod_id);
              all.push(item);
            }
          });
        });
        all.sort((a, b) => (b.vod_time || '').localeCompare(a.vod_time || ''));
        const list = all.slice(0, pageSize);

        this.state.total = totalSum;
        this.state.pagecount = Math.max(1, Math.ceil(totalSum / pageSize));
        this.state.limit = pageSize;

        if (list.length === 0) {
          listEl.innerHTML = '';
          emptyEl.style.display = 'block';
          return;
        }
        this.renderList(list);
        this.renderPagination();
        this.loadPosters(list);
        // 分类曾加载失败（如刚启动网络不通），列表恢复后自动补拉一次
        if (this.state.categories.length === 0) this.loadCategories();
        return;
      }

      const params = { pg: this.state.page };
      if (this.state.currentCategory) params.t = this.state.currentCategory;
      if (this.state.keyword) params.wd = this.state.keyword;

      const data = await Api.getList(params);

      if (!data || data.code !== 1) {
        throw new Error(data && data.msg ? data.msg : '接口返回异常');
      }

      const list = data.list || [];
      this.state.total = data.total || list.length;
      this.state.pagecount = data.pagecount || 1;
      this.state.limit = parseInt(data.limit) || 20;

      if (list.length === 0) {
        listEl.innerHTML = '';
        emptyEl.style.display = 'block';
        return;
      }

      this.renderList(list);
      this.renderPagination();
      // 异步加载海报
      this.loadPosters(list);
      // 分类曾加载失败（如刚启动网络不通），列表恢复后自动补拉一次
      if (this.state.categories.length === 0) this.loadCategories();
    } catch (e) {
      console.error('加载失败', e);
      listEl.innerHTML = '';
      errorEl.style.display = 'block';
      document.getElementById('errorMsg').textContent = '加载失败：' + e.message;
      if (e.message.indexOf('未配置') >= 0 || e.message.indexOf('数据源') >= 0) {
        errorEl.innerHTML = `
          <div class="icon">⚙</div>
          <div>未配置数据源</div>
          <div style="margin-top:8px;font-size:13px;color:var(--c-text-mute);">点击右上角 ⚙ 添加数据源</div>
          <button class="btn btn-primary" style="margin-top:14px;" onclick="SourceManager.open()">立即添加</button>
        `;
      }
    }
  },

  // 渲染列表
  renderList(list) {
    const listEl = document.getElementById('videoList');
    listEl.innerHTML = list.map(item => {
      const id = item.vod_id;
      const name = Common.escape(item.vod_name || '未知');
      const remarks = Common.escape(item.vod_remarks || '');
      const typeName = Common.escape(item.type_name || '');
      const time = (item.vod_time || '').slice(0, 10);
      return `
        <div class="video-card" onclick="Common.go('detail.html', { id: ${id} })">
          <div class="card-poster" id="poster_${id}">
            <div class="poster-placeholder">🎬</div>
          </div>
          ${remarks ? `<span class="card-remarks">${remarks}</span>` : ''}
          <div class="card-info">
            <div class="card-title">${name}</div>
            <div class="card-meta">${typeName}${time ? ' · ' + time : ''}</div>
          </div>
        </div>
      `;
    }).join('');
  },

  // 骨架屏
  renderSkeleton() {
    let html = '<div class="skeleton-grid" style="grid-column:1/-1;">';
    for (let i = 0; i < 12; i++) {
      html += `
        <div class="skeleton-card">
          <div class="skeleton-poster"></div>
          <div class="skeleton-line"></div>
          <div class="skeleton-line short"></div>
        </div>
      `;
    }
    html += '</div>';
    return html;
  },

  // 异步加载海报（按批次请求详情接口）
  async loadPosters(list) {
    const settings = Config.getSettings();
    if (!settings.postersEnabled) return;

    // 批量请求，每批 10 个（并发过大容易拥塞，反而更慢）
    const batchSize = 10;
    for (let i = 0; i < list.length; i += batchSize) {
      const batch = list.slice(i, i + batchSize);
      const ids = batch.map(x => x.vod_id);
      try {
        const data = await Api.getDetailBatch(ids);
        const detailList = (data && data.list) || [];
        for (const d of detailList) {
          if (d.vod_pic) {
            const el = document.getElementById('poster_' + d.vod_id);
            if (el) {
              el.innerHTML = `<img src="${Api.wrapPoster(d.vod_pic)}" loading="lazy" alt="${Common.escape(d.vod_name || '')}" onerror="this.parentNode.innerHTML='<div class=\\'poster-placeholder\\'>🎬</div>'">`;
            }
          }
        }
      } catch (e) {
        console.warn('海报加载失败', e);
      }
    }
  },

  // 渲染分页
  renderPagination() {
    const pagEl = document.getElementById('pagination');
    const cur = this.state.page;
    const total = this.state.pagecount;
    if (total <= 1) {
      pagEl.style.display = 'none';
      return;
    }
    pagEl.style.display = 'flex';

    // 生成页码（智能省略）
    const pages = [];
    const add = (n) => pages.push({ type: 'page', n });
    const addDots = () => pages.push({ type: 'dots' });

    add(1);
    if (cur > 4) addDots();
    const start = Math.max(2, cur - 2);
    const end = Math.min(total - 1, cur + 2);
    for (let i = start; i <= end; i++) add(i);
    if (cur < total - 3) addDots();
    if (total > 1) add(total);

    const prevSvg = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
    const nextSvg = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';
    let html = '';
    html += `<button class="page-btn" ${cur <= 1 ? 'disabled' : ''} onclick="Home.goPage(${cur - 1})" aria-label="上一页">${prevSvg}</button>`;
    for (const p of pages) {
      if (p.type === 'dots') {
        html += `<span class="page-info">...</span>`;
      } else {
        html += `<button class="page-btn ${p.n === cur ? 'active' : ''}" onclick="Home.goPage(${p.n})">${p.n}</button>`;
      }
    }
    html += `<button class="page-btn" ${cur >= total ? 'disabled' : ''} onclick="Home.goPage(${cur + 1})" aria-label="下一页">${nextSvg}</button>`;
    html += `<span class="page-info">${cur}/${total}页 · 共${this.state.total}条</span>`;
    pagEl.innerHTML = html;
  },

  goPage(n) {
    if (n < 1 || n > this.state.pagecount || n === this.state.page) return;
    this.state.page = n;
    this.loadList();
    this.scrollToTop();
  },
};

// 数据源变更回调
window.onSourcesChanged = () => {
  if (window.Home) Home.onSourceChanged();
};

document.addEventListener('DOMContentLoaded', () => Home.init());
