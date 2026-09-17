/*
 * detail.js - 详情页逻辑
 * 功能：获取详情、显示海报/剧情/演员、解析播放源、剧集列表
 */

const Detail = {
  state: {
    id: '',
    detail: null,
    sources: [],   // 解析后的播放源
    currentSourceIdx: 0,
  },

  async init() {
    const id = Common.getParam('id');
    if (!id) {
      document.getElementById('errorState').style.display = 'block';
      document.getElementById('errorMsg').textContent = '缺少视频ID';
      return;
    }
    this.state.id = id;

    // 搜索框
    const input = document.getElementById('searchInput');
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.doSearch();
      });
    }

    this.load();
  },

  doSearch() {
    const kw = document.getElementById('searchInput').value.trim();
    Common.go('index.html', { wd: kw });
  },

  async load() {
    const skel = document.getElementById('detailSkeleton');
    const content = document.getElementById('detailContent');
    const errorEl = document.getElementById('errorState');

    skel.style.display = 'block';
    content.innerHTML = '';
    errorEl.style.display = 'none';

    try {
      const data = await Api.getDetail(this.state.id);
      const list = (data && data.list) || [];
      if (list.length === 0) {
        throw new Error('未找到该影视信息');
      }
      const d = list[0];
      this.state.detail = d;
      this.state.sources = Api.parsePlaySources(d.vod_play_from, d.vod_play_url);
      this.state.sources = Api.filterM3u8Sources(this.state.sources);

      this.render(d);
    } catch (e) {
      console.error('详情加载失败', e);
      skel.style.display = 'none';
      errorEl.style.display = 'block';
      document.getElementById('errorMsg').textContent = '加载失败：' + e.message;
    }
  },

  // 渲染数据源切换下拉框（内联到HTML字符串中）
  renderSourceSwitchInline(vodName) {
    const allSources = Config.getSources().filter(s => s.enabled);
    if (allSources.length < 2) return '';
    const cur = Config.getCurrentSource();
    const opts = allSources.map(s =>
      `<option value="${s.id}" ${cur && cur.id === s.id ? 'selected' : ''}>${Common.escape(s.name)}${cur && cur.id === s.id ? ' (当前)' : ''}</option>`
    ).join('');
    return `
      <div class="source-switch">
        <select onchange="Detail.onSourceSwitch(this.value)" data-vod-name="${Common.escape(vodName)}">
          ${opts}
        </select>
      </div>
    `;
  },

  // 切换数据源
  async onSourceSwitch(newSourceId) {
    // 从当前 select 元素取 vodName
    const sel = document.querySelector('.detail-action-bar select');
    const vodName = sel ? sel.dataset.vodName : '';
    if (!vodName) return;
    await Common.switchSourceAndReload(newSourceId, vodName);
  },

  render(d) {
    document.getElementById('detailSkeleton').style.display = 'none';
    const content = document.getElementById('detailContent');

    const pic = d.vod_pic ? Api.wrapPoster(d.vod_pic) : '';
    const year = (d.vod_year || '').slice(0, 4);
    const area = d.vod_area || '';
    const lang = d.vod_lang || '';
    const typeName = d.type_name || '';
    const remarks = d.vod_remarks || '';
    const actor = d.vod_actor || '未知';
    const director = d.vod_director || '未知';
    const content2 = d.vod_content || d.vod_blurb || '暂无剧情简介';

    content.innerHTML = `
      <div class="detail-hero">
        <div class="detail-poster" id="detailPoster">
          ${pic ? `<img src="${pic}" alt="${Common.escape(d.vod_name)}" onerror="this.style.display='none';this.parentNode.innerHTML='<div class=\\'poster-placeholder\\'>🎬</div>'">` : '<div class="poster-placeholder" style="display:flex;align-items:center;justify-content:center;height:100%;">🎬</div>'}
        </div>
        <div class="detail-info">
          <h1 class="detail-title">${Common.escape(d.vod_name || '未知')}
            ${remarks ? `<span style="font-size:13px;color:var(--c-gold);margin-left:8px;font-weight:normal;">${Common.escape(remarks)}</span>` : ''}
          </h1>
          <div class="detail-meta">
            ${typeName ? `<div class="row"><span class="label">类型</span><span class="val">${Common.escape(typeName)}</span></div>` : ''}
            ${year ? `<div class="row"><span class="label">年份</span><span class="val">${Common.escape(year)}</span></div>` : ''}
            ${area ? `<div class="row"><span class="label">地区</span><span class="val">${Common.escape(area)}</span></div>` : ''}
            ${lang ? `<div class="row"><span class="label">语言</span><span class="val">${Common.escape(lang)}</span></div>` : ''}
            <div class="row"><span class="label">导演</span><span class="val">${Common.escape(Common.truncate(director, 60))}</span></div>
            <div class="row"><span class="label">主演</span><span class="val">${Common.escape(Common.truncate(actor, 80))}</span></div>
          </div>
          <div class="detail-content">${Common.escape(content2)}</div>
          <div class="detail-action-bar">
            ${this.renderSourceSwitchInline(d.vod_name)}
            ${this.state.sources.length > 0 ? `
              <button class="btn btn-primary detail-play-btn" onclick="Detail.startPlay(0, 0)">▶ 立即播放</button>
            ` : '<div style="color:var(--c-text-mute);font-size:13px;">该影视暂无可播放源</div>'}
          </div>
        </div>
      </div>

      ${this.state.sources.length > 0 ? this.renderSources() : ''}
    `;

    // 滚到顶部
    window.scrollTo(0, 0);
  },

  renderSources() {
    const srcs = this.state.sources;
    let html = '<h2 class="section-title">选集</h2>';
    // 源切换标签
    if (srcs.length > 1) {
      html += '<div class="source-tabs">';
      srcs.forEach((s, i) => {
        html += `<span class="source-tab ${i === this.state.currentSourceIdx ? 'active' : ''}" onclick="Detail.selectSource(${i})">${Common.escape(s.name)} (${s.episodes.length}集)</span>`;
      });
      html += '</div>';
    }
    // 剧集列表
    html += '<div class="episode-grid" id="episodeGrid">' + this.renderEpisodes() + '</div>';
    return html;
  },

  renderEpisodes() {
    const src = this.state.sources[this.state.currentSourceIdx];
    if (!src) return '';
    const fromPage = Common.getParam('from_page');
    const fromEp = parseInt(Common.getParam('ep')) || 0;
    return src.episodes.map((ep, i) => {
      const active = (fromPage === 'play' && i === fromEp) ? 'active' : '';
      return `<span class="episode-item ${active}" onclick="Detail.startPlay(${this.state.currentSourceIdx}, ${i})" title="${Common.escape(ep.name)}">${Common.escape(Common.truncate(ep.name, 10))}</span>`;
    }).join('');
  },

  selectSource(idx) {
    this.state.currentSourceIdx = idx;
    // 更新标签状态
    document.querySelectorAll('.source-tab').forEach((el, i) => {
      el.classList.toggle('active', i === idx);
    });
    document.getElementById('episodeGrid').innerHTML = this.renderEpisodes();
  },

  startPlay(srcIdx, epIdx) {
    const d = this.state.detail;
    if (!d) return;
    Common.go('play.html', {
      id: d.vod_id,
      src: srcIdx,
      ep: epIdx,
    });
  },
};

document.addEventListener('DOMContentLoaded', () => Detail.init());
