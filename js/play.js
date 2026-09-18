/*
 * play.js - 播放页逻辑
 * 功能：使用 hls.js 播放 m3u8，支持剧集切换、播放源切换
 */

const Play = {
  state: {
    id: '',
    srcIdx: 0,
    epIdx: 0,
    detail: null,
    sources: [],
    hls: null,
    video: null,
    playHistory: 'yingxuanguan_history_v1',
  },

  async init() {
    const id = Common.getParam('id');
    if (!id) {
      this.showError('缺少视频ID');
      return;
    }
    this.state.id = id;
    this.state.srcIdx = parseInt(Common.getParam('src')) || 0;
    this.state.epIdx = parseInt(Common.getParam('ep')) || 0;

    // 优先从历史恢复
    this.tryRestoreFromHistory();

    await this.load();
  },

  // 从历史恢复（如果是同一视频，可恢复上次播放进度）
  tryRestoreFromHistory() {
    try {
      const raw = localStorage.getItem(this.state.playHistory);
      if (!raw) return;
      const all = JSON.parse(raw);
      const item = all[this.state.id];
      if (item && item.epIdx !== undefined && !Common.getParam('ep')) {
        // 如果是直接访问(没有ep参数)，恢复上次集数
        this.state.epIdx = item.epIdx;
        if (item.srcIdx !== undefined) {
          this.state.srcIdx = item.srcIdx;
        }
      }
    } catch (e) {}
  },

  saveHistory() {
    try {
      const raw = localStorage.getItem(this.state.playHistory);
      const all = raw ? JSON.parse(raw) : {};
      all[this.state.id] = {
        name: this.state.detail ? this.state.detail.vod_name : '',
        srcIdx: this.state.srcIdx,
        epIdx: this.state.epIdx,
        ts: Date.now(),
      };
      // 最多保留 100 条
      const keys = Object.keys(all);
      if (keys.length > 100) {
        keys.sort((a, b) => (all[a].ts || 0) - (all[b].ts || 0));
        for (let i = 0; i < keys.length - 100; i++) delete all[keys[i]];
      }
      localStorage.setItem(this.state.playHistory, JSON.stringify(all));

      // 同步到观看历史列表（首页展示，可续播）
      if (window.WatchHistory && this.state.detail) {
        const src = this.state.sources[this.state.srcIdx];
        const ep = src ? src.episodes[this.state.epIdx] : null;
        const curSource = Config.getCurrentSource();
        WatchHistory.add({
          id: this.state.id,
          name: this.state.detail.vod_name,
          pic: this.state.detail.vod_pic || '',
          srcIdx: this.state.srcIdx,
          epIdx: this.state.epIdx,
          epName: ep ? ep.name : '',
          sourceId: curSource ? curSource.id : '',
          sourceName: curSource ? curSource.name : '',
        });
      }
    } catch (e) {}
  },

  showError(msg) {
    const wrap = document.getElementById('playerWrap');
    wrap.innerHTML = `
      <div class="player-placeholder">
        <div style="font-size:36px;">⚠</div>
        <div>${Common.escape(msg)}</div>
        <button class="btn btn-primary" style="margin-top:14px;" onclick="location.reload()">重试</button>
      </div>
    `;
  },

  async load() {
    try {
      const data = await Api.getDetail(this.state.id);
      const list = (data && data.list) || [];
      if (list.length === 0) {
        this.showError('未找到该影视信息');
        return;
      }
      const d = list[0];
      this.state.detail = d;
      this.state.sources = Api.filterM3u8Sources(
        Api.parsePlaySources(d.vod_play_from, d.vod_play_url)
      );

      if (this.state.sources.length === 0) {
        this.showError('该影视暂无可播放源');
        return;
      }
      if (this.state.srcIdx >= this.state.sources.length) {
        this.state.srcIdx = 0;
      }
      const src = this.state.sources[this.state.srcIdx];
      if (this.state.epIdx >= src.episodes.length) {
        this.state.epIdx = 0;
      }

      this.renderInfo();
      this.renderEpisodes();
      this.playCurrent();
    } catch (e) {
      this.showError('加载失败：' + e.message);
    }
  },

  // 切换数据源
  async onSourceSwitch(newSourceId) {
    const sel = document.querySelector('.play-action-bar select');
    const vodName = sel ? sel.dataset.vodName : '';
    if (!vodName) return;
    this.destroyPlayer();
    await Common.switchSourceAndReload(newSourceId, vodName);
  },

  renderInfo() {
    const d = this.state.detail;
    document.title = (d.vod_name || '播放') + ' - 影序馆';
    document.getElementById('playTitle').textContent = d.vod_name || '';
    const src = this.state.sources[this.state.srcIdx];
    const ep = src.episodes[this.state.epIdx];
    const info = [];
    if (d.type_name) info.push(d.type_name);
    if (d.vod_year) info.push((d.vod_year + '').slice(0, 4));
    if (src) info.push(src.name);
    if (ep) info.push(ep.name);
    document.getElementById('playInfo').textContent = info.join(' · ');
    document.getElementById('detailLink').href = 'detail.html?id=' + d.vod_id;

    // 渲染数据源切换到按钮组
    this.renderSourceSwitchInline(d.vod_name);
  },

  // 渲染数据源切换到按钮组
  renderSourceSwitchInline(vodName) {
    const allSources = Config.getSources().filter(s => s.enabled);
    const bar = document.getElementById('playActionBar');
    if (!bar) return;
    // 先删旧的
    bar.querySelectorAll('.source-switch').forEach(el => el.remove());
    if (allSources.length < 2) return;
    const cur = Config.getCurrentSource();
    const opts = allSources.map(s =>
      `<option value="${s.id}" ${cur && cur.id === s.id ? 'selected' : ''}>${Common.escape(s.name)}${cur && cur.id === s.id ? ' (当前)' : ''}</option>`
    ).join('');
    const div = document.createElement('div');
    div.className = 'source-switch';
    div.innerHTML = `<select onchange="Play.onSourceSwitch(this.value)" data-vod-name="${Common.escape(vodName)}">${opts}</select>`;
    // 插到第一个按钮之前
    bar.insertBefore(div, bar.firstChild);
  },

  renderEpisodes() {
    // 播放源标签
    const tabsEl = document.getElementById('sourceTabs');
    if (this.state.sources.length > 1) {
      tabsEl.style.display = 'flex';
      tabsEl.innerHTML = this.state.sources.map((s, i) => `
        <span class="source-tab ${i === this.state.srcIdx ? 'active' : ''}" onclick="Play.selectSource(${i})">${Common.escape(s.name)}</span>
      `).join('');
    } else {
      tabsEl.style.display = 'none';
    }

    // 剧集列表
    const grid = document.getElementById('episodeGrid');
    const src = this.state.sources[this.state.srcIdx];
    grid.innerHTML = src.episodes.map((ep, i) => `
      <span class="episode-item ${i === this.state.epIdx ? 'active' : ''}" onclick="Play.selectEpisode(${i})" title="${Common.escape(ep.name)}">${Common.escape(Common.truncate(ep.name, 10))}</span>
    `).join('');

    this.updateNavButtons();
  },

  updateNavButtons() {
    const src = this.state.sources[this.state.srcIdx];
    document.getElementById('prevEpBtn').disabled = this.state.epIdx <= 0;
    document.getElementById('nextEpBtn').disabled = this.state.epIdx >= src.episodes.length - 1;
  },

  selectSource(idx) {
    if (idx === this.state.srcIdx) return;
    this.state.srcIdx = idx;
    this.state.epIdx = 0;
    this.renderInfo();
    this.renderEpisodes();
    this.playCurrent();
    this.saveHistory();
  },

  selectEpisode(idx) {
    if (idx === this.state.epIdx) return;
    this.state.epIdx = idx;
    this.renderInfo();
    this.renderEpisodes();
    this.playCurrent();
    this.saveHistory();
  },

  changeEpisode(delta) {
    const src = this.state.sources[this.state.srcIdx];
    const next = this.state.epIdx + delta;
    if (next < 0 || next >= src.episodes.length) return;
    this.selectEpisode(next);
  },

  // 播放当前集
  playCurrent() {
    const src = this.state.sources[this.state.srcIdx];
    const ep = src.episodes[this.state.epIdx];
    if (!ep || !ep.url) {
      this.showError('播放地址无效');
      return;
    }

    // 销毁旧的
    this.destroyPlayer();
    this._netRetried = false;

    const wrap = document.getElementById('playerWrap');
    wrap.innerHTML = '<video id="videoPlayer" controls playsinline autoplay></video>';
    const video = document.getElementById('videoPlayer');
    this.state.video = video;

    const url = ep.url;

    // 滚动到播放器
    wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });

    if (Api.isM3u8(url)) {
      // m3u8 播放
      if (window.Hls && Hls.isSupported()) {
        // Chrome/Firefox 通过 hls.js
        const hls = new Hls({
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
      enableWorker: true,
      // 资源站网络可能较慢，调大超时并增加重试，避免误报 levelLoadError
      manifestLoadingTimeOut: 20000,
      manifestLoadingMaxRetry: 3,
      manifestLoadingRetryDelay: 1000,
      levelLoadingTimeOut: 20000,
      levelLoadingMaxRetry: 4,
      levelLoadingRetryDelay: 1000,
      fragLoadingTimeOut: 45000,
      fragLoadingMaxRetry: 6,
      fragLoadingRetryDelay: 1000,
    });
        this.state.hls = hls;
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => {});
        });
        hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            this.handlePlayError(data);
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari 原生支持
        video.src = url;
        video.addEventListener('loadedmetadata', () => {
          video.play().catch(() => {});
        });
        video.addEventListener('error', () => {
          this.handlePlayError({ details: 'Native HLS error' });
        });
      } else {
        this.showError('当前浏览器不支持 m3u8 播放，请使用 Chrome/Edge/Safari');
      }
    } else {
      // 非 m3u8，尝试原生播放
      video.src = url;
      video.addEventListener('loadedmetadata', () => {
        video.play().catch(() => {});
      });
      video.addEventListener('error', () => {
        this.handlePlayError({ details: 'Video error' });
      });
    }

    // 自动播放下一集
    video.addEventListener('ended', () => {
      // 自动播放下一集
      const src = this.state.sources[this.state.srcIdx];
      if (this.state.epIdx < src.episodes.length - 1) {
        if (Common.confirm('是否播放下一集？')) {
          this.changeEpisode(1);
        }
      } else {
        Common.toast('已是最后一集', 3000);
      }
    });

    this.saveHistory();
  },

  handlePlayError(data) {
    console.error('播放错误', data);
    // 网络类致命错误自动重试一次（网络慢时 hls.js 内部重试可能全部超时）
    if (data && data.fatal && !this._netRetried && data.type === Hls.ErrorTypes.NETWORK_ERROR) {
      this._netRetried = true;
      Common.toast('网络波动，正在自动重试...', 2000);
      try { this.state.hls.startLoad(); return; } catch (e) {}
    }
    this._netRetried = false;
    let msg = '播放失败';
    if (data && data.details) msg += '：' + data.details;
    msg += '\n可尝试切换其他播放源或剧集';
    this.showError(msg);
  },

  destroyPlayer() {
    if (this.state.hls) {
      try { this.state.hls.destroy(); } catch (e) {}
      this.state.hls = null;
    }
    if (this.state.video) {
      try {
        this.state.video.pause();
        this.state.video.removeAttribute('src');
        this.state.video.load();
      } catch (e) {}
      this.state.video = null;
    }
  },
};

// 页面卸载时清理
window.addEventListener('beforeunload', () => {
  if (window.Play) Play.destroyPlayer();
});

document.addEventListener('DOMContentLoaded', () => Play.init());
