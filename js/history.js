/*
 * history.js - 观看历史
 * 播放时自动记录（名称/封面/集数/数据源），首页展示，点击可续播
 * 命名为 WatchHistory，避免覆盖浏览器内置的 History 构造器
 */

const WatchHistory = {
  KEY: 'yingxuanguan_watch_v1',
  MAX: 50,

  // 读取列表（按时间倒序）
  getList() {
    try {
      const arr = JSON.parse(localStorage.getItem(this.KEY) || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  },

  // 保存列表
  _save(arr) {
    localStorage.setItem(this.KEY, JSON.stringify(arr));
  },

  // 添加/更新一条记录（同ID去重，置顶）
  add(item) {
    if (!item || item.id === undefined || item.id === '') return;
    try {
      const arr = this.getList().filter(x => String(x.id) !== String(item.id));
      arr.unshift({
        id: item.id,
        name: item.name || '',
        pic: item.pic || '',
        srcIdx: item.srcIdx || 0,
        epIdx: item.epIdx || 0,
        epName: item.epName || '',
        sourceId: item.sourceId || '',
        sourceName: item.sourceName || '',
        ts: Date.now(),
      });
      if (arr.length > this.MAX) arr.length = this.MAX;
      this._save(arr);
    } catch (e) {}
  },

  // 删除单条
  remove(id, ev) {
    if (ev) {
      ev.stopPropagation();
      ev.preventDefault();
    }
    this._save(this.getList().filter(x => String(x.id) !== String(id)));
    this.renderHome();
    Common.toast('已删除该记录');
  },

  // 清空全部
  clearAll() {
    if (this.getList().length === 0) return;
    if (!Common.confirm('确定清空全部观看历史？')) return;
    this._save([]);
    this.renderHome();
    Common.toast('观看历史已清空');
  },

  // 继续播放：如原数据源还在且不是当前源，自动切回
  open(idx) {
    const item = this.getList()[idx];
    if (!item) return;
    const cur = Config.getCurrentSource();
    if (!cur || cur.id !== item.sourceId) {
      const src = Config.getSources().find(s => s.id === item.sourceId && s.enabled);
      if (src) {
        Config.setCurrentSource(item.sourceId);
        Common.toast('已切换到「' + src.name + '」');
      } else if (item.sourceId) {
        Common.toast('原数据源已失效，将用当前数据源打开');
      }
    }
    Common.go('play.html', { id: item.id, src: item.srcIdx || 0 });
  },

  // 格式化时间
  _fmtTime(ts) {
    const d = new Date(ts);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const hm = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    if (sameDay) return '今天 ' + hm;
    const yest = new Date(now.getTime() - 86400000);
    if (d.toDateString() === yest.toDateString()) return '昨天 ' + hm;
    return (d.getMonth() + 1) + '-' + d.getDate() + ' ' + hm;
  },

  // 渲染首页"观看历史"区块（无记录时隐藏）
  renderHome() {
    const section = document.getElementById('historySection');
    const listEl = document.getElementById('historyList');
    if (!section || !listEl) return;
    const list = this.getList();
    if (list.length === 0) {
      section.style.display = 'none';
      listEl.innerHTML = '';
      return;
    }
    section.style.display = 'block';
    document.getElementById('historyCount').textContent = list.length + '条';
    listEl.innerHTML = list.map((item, i) => {
      const name = Common.escape(item.name || '未知');
      const ep = item.epName ? Common.escape(Common.truncate(item.epName, 12)) : '';
      const time = this._fmtTime(item.ts);
      const pic = item.pic ? Api.wrapPoster(item.pic) : '';
      const poster = pic
        ? `<img src="${pic}" loading="lazy" alt="${name}" onerror="this.style.display='none'">`
        : '';
      return `
        <div class="history-card" tabindex="0" onclick="WatchHistory.open(${i})" title="${name}">
          <div class="history-poster">
            ${poster}
            ${!pic ? '<div class="poster-placeholder" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">🎬</div>' : ''}
            ${ep ? `<span class="history-ep">${ep}</span>` : ''}
            <button class="history-remove" title="删除" onclick="WatchHistory.remove('${item.id}', event)">×</button>
          </div>
          <div class="history-name">${name}</div>
          <div class="history-time">${time}</div>
        </div>
      `;
    }).join('');
  },
};

window.WatchHistory = WatchHistory;
