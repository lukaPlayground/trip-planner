/**
 * Admin Dashboard — localhost:5001
 * phpMyAdmin 스타일 서버-렌더링 HTML. 추가 npm 패키지 없음.
 * ⚠ Local development only — 프로덕션 환경에서는 비활성화할 것.
 */

const express = require('express');
const router  = express.Router();
const User    = require('../models/User');
const Plan    = require('../models/Plan');
const mongoose = require('mongoose');

// ── 이동수단 레이블 ──
const TRANSPORT_LABEL = {
  walk:       '🚶 도보',
  bicycle:    '🚴 자전거',
  motorcycle: '🏍 바이크',
  bus:        '🚌 대중교통',
  subway:     '🚇 지하철',
  transit:    '🚌 대중교통',
  train:      '🚆 기차',
  car:        '🚗 자동차',
  taxi:       '🚕 택시',
  ship:       '🚢 배',
  plane:      '✈️ 비행기',
};

// ── 날짜 포맷 ──
const fmtDate = (d) => {
  if (!d) return '-';
  const dt = new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}.${pad(dt.getMonth() + 1)}.${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
};

// ── 장소 행 렌더 ──
const renderPlaces = (places) => {
  if (!places || places.length === 0) return '<span style="color:#484f58;">—</span>';
  return `
    <div style="display:flex;flex-direction:column;gap:3px;">
      ${places.map(pl => `
        <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
          <span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#1f6feb;color:white;font-size:10px;font-weight:700;flex-shrink:0;">${pl.order}</span>
          <span style="${pl.checked ? 'text-decoration:line-through;opacity:0.4;' : ''}color:#e6edf3;">${escHtml(pl.name)}</span>
          ${pl.transport && pl.transport !== 'bus'
            ? `<span style="color:#8b949e;font-size:11px;">${TRANSPORT_LABEL[pl.transport] || pl.transport}</span>`
            : ''}
          ${pl.reservation
            ? `<span style="background:#3d1f00;color:#f0883e;border:1px solid #bd561d;border-radius:10px;padding:1px 6px;font-size:10px;">🎫 ${escHtml(pl.reservation)}</span>`
            : ''}
          ${pl.note
            ? `<span style="color:#8b949e;font-size:11px;">📝 ${escHtml(pl.note.slice(0, 20))}${pl.note.length > 20 ? '…' : ''}</span>`
            : ''}
        </div>
      `).join('')}
    </div>
  `;
};

// XSS 방지용 최소 이스케이프
const escHtml = (str) => String(str ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

// ── GET / ──
router.get('/', async (req, res) => {
  try {
    const dbState = mongoose.connection.readyState; // 0=disconnected,1=connected,2=connecting,3=disconnecting
    const isConnected = dbState === 1;

    const [userCount, planCount, publicPlanCount] = await Promise.all([
      User.countDocuments(),
      Plan.countDocuments(),
      Plan.countDocuments({ isPublic: true }),
    ]);

    const placesAgg = await Plan.aggregate([
      { $project: { placesCount: { $size: '$places' } } },
      { $group: { _id: null, total: { $sum: '$placesCount' } } },
    ]);
    const totalPlaces = placesAgg[0]?.total || 0;
    const avgPlaces   = planCount > 0 ? (totalPlaces / planCount).toFixed(1) : '0';

    const users = await User.find().sort({ createdAt: -1 }).select('-password').lean();
    const plans = await Plan.find().sort({ updatedAt: -1 }).populate('userId', 'name email').lean();

    // 유저별 플랜 수 맵
    const planCountByUser = {};
    plans.forEach(p => {
      const uid = String(p.userId?._id || p.userId || '');
      planCountByUser[uid] = (planCountByUser[uid] || 0) + 1;
    });

    res.send(`<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Trip Planner — Admin</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0d1117; color: #e6edf3;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
      font-size: 13px; line-height: 1.5;
    }

    /* ── Header ── */
    header {
      background: #161b22; border-bottom: 1px solid #30363d;
      padding: 12px 24px; display: flex; align-items: center; gap: 10px;
      position: sticky; top: 0; z-index: 50;
    }
    header .logo { font-size: 18px; }
    header h1 { font-size: 15px; font-weight: 700; color: #58a6ff; }
    header .sub { font-size: 11px; color: #484f58; margin-left: 2px; }
    .db-badge {
      margin-left: auto; display: flex; align-items: center; gap: 6px;
      font-size: 11px; color: #8b949e;
    }
    .db-dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: ${isConnected ? '#3fb950' : '#f85149'};
      box-shadow: 0 0 5px ${isConnected ? '#3fb950' : '#f85149'};
      flex-shrink: 0;
    }
    .refresh-link {
      background: #21262d; border: 1px solid #30363d; color: #8b949e;
      padding: 4px 12px; border-radius: 6px; text-decoration: none;
      font-size: 11px; transition: all 0.15s; margin-left: 10px;
    }
    .refresh-link:hover { background: #30363d; color: #e6edf3; border-color: #58a6ff; }

    /* ── Main ── */
    main { max-width: 1440px; margin: 0 auto; padding: 24px; }

    /* ── Stats ── */
    .stats {
      display: grid; grid-template-columns: repeat(4, 1fr);
      gap: 12px; margin-bottom: 28px;
    }
    .stat-card {
      background: #161b22; border: 1px solid #30363d;
      border-radius: 8px; padding: 16px 18px;
    }
    .stat-label { font-size: 10px; color: #8b949e; text-transform: uppercase; letter-spacing: 0.7px; margin-bottom: 6px; }
    .stat-value { font-size: 30px; font-weight: 700; color: #e6edf3; letter-spacing: -0.5px; }
    .stat-sub { font-size: 11px; color: #8b949e; margin-top: 3px; }

    /* ── Section ── */
    section { margin-bottom: 32px; }
    .section-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
    .section-header h2 { font-size: 14px; font-weight: 600; color: #e6edf3; }
    .count-badge {
      background: rgba(31,111,235,0.15); color: #58a6ff;
      border: 1px solid rgba(31,111,235,0.35); border-radius: 12px;
      padding: 1px 8px; font-size: 11px; font-weight: 500;
    }

    /* ── Table ── */
    .table-wrap {
      background: #161b22; border: 1px solid #30363d;
      border-radius: 8px; overflow: hidden; overflow-x: auto;
    }
    table { width: 100%; border-collapse: collapse; }
    thead tr { background: #1c2128; }
    th {
      padding: 9px 14px; text-align: left;
      font-size: 10px; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.5px; color: #8b949e;
      border-bottom: 1px solid #30363d; white-space: nowrap;
    }
    td { padding: 9px 14px; border-bottom: 1px solid #21262d; vertical-align: top; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #1c2128; }

    /* ── Badges ── */
    .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 500; white-space: nowrap; }
    .badge-green  { background: #0d4429; color: #3fb950; border: 1px solid #26a641; }
    .badge-gray   { background: #21262d; color: #8b949e; border: 1px solid #30363d; }
    .badge-blue   { background: #0c2d6b; color: #58a6ff; border: 1px solid #1f6feb; }

    /* ── Mono ── */
    .oid { font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace; font-size: 11px; color: #8b949e; }

    /* ── Timestamp ── */
    .ts { color: #8b949e; font-size: 11px; white-space: nowrap; }

    /* ── Empty ── */
    .empty { text-align: center; padding: 32px; color: #484f58; }

    /* ── Footer ── */
    .footer { text-align: center; color: #484f58; font-size: 11px; padding: 12px 0 4px; }
  </style>
</head>
<body>

<header>
  <span class="logo">🗺</span>
  <h1>Trip Planner</h1>
  <span class="sub">Admin Dashboard</span>
  <div class="db-badge">
    <span class="db-dot"></span>
    MongoDB ${isConnected ? 'Connected' : 'Disconnected'}
    <a href="/" class="refresh-link">↺ 새로고침</a>
  </div>
</header>

<main>

  <!-- Stats -->
  <div class="stats">
    <div class="stat-card">
      <div class="stat-label">Users</div>
      <div class="stat-value">${userCount}</div>
      <div class="stat-sub">전체 회원</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Plans</div>
      <div class="stat-value">${planCount}</div>
      <div class="stat-sub">공개 ${publicPlanCount} · 비공개 ${planCount - publicPlanCount}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Places</div>
      <div class="stat-value">${totalPlaces}</div>
      <div class="stat-sub">전체 장소 수</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Avg Places / Plan</div>
      <div class="stat-value">${avgPlaces}</div>
      <div class="stat-sub">플랜당 평균 장소</div>
    </div>
  </div>

  <!-- Users -->
  <section>
    <div class="section-header">
      <h2>Users</h2>
      <span class="count-badge">${userCount}</span>
    </div>
    <div class="table-wrap">
      ${users.length === 0
        ? '<div class="empty">등록된 사용자가 없습니다</div>'
        : `<table>
          <thead>
            <tr>
              <th>_id</th>
              <th>이름</th>
              <th>이메일</th>
              <th>플랜 수</th>
              <th>가입일</th>
            </tr>
          </thead>
          <tbody>
            ${users.map(u => `
            <tr>
              <td><span class="oid">${u._id}</span></td>
              <td><strong style="color:#e6edf3;">${escHtml(u.name)}</strong></td>
              <td style="color:#58a6ff;">${escHtml(u.email)}</td>
              <td><span class="badge badge-blue">${planCountByUser[String(u._id)] || 0}개</span></td>
              <td><span class="ts">${fmtDate(u.createdAt)}</span></td>
            </tr>`).join('')}
          </tbody>
        </table>`}
    </div>
  </section>

  <!-- Plans -->
  <section>
    <div class="section-header">
      <h2>Plans</h2>
      <span class="count-badge">${planCount}</span>
    </div>
    <div class="table-wrap">
      ${plans.length === 0
        ? '<div class="empty">등록된 플랜이 없습니다</div>'
        : `<table>
          <thead>
            <tr>
              <th>_id</th>
              <th>플랜명</th>
              <th>작성자</th>
              <th>공개</th>
              <th>장소 (${totalPlaces}개)</th>
              <th>수정일</th>
              <th>생성일</th>
            </tr>
          </thead>
          <tbody>
            ${plans.map(p => `
            <tr>
              <td><span class="oid">${p._id}</span></td>
              <td>
                <strong style="color:#e6edf3;">${escHtml(p.planName)}</strong>
                ${p.description
                  ? `<div style="color:#8b949e;font-size:11px;margin-top:2px;">${escHtml(p.description.slice(0, 60))}${p.description.length > 60 ? '…' : ''}</div>`
                  : ''}
              </td>
              <td>
                <div style="color:#e6edf3;">${escHtml(p.userId?.name || '알 수 없음')}</div>
                <div style="color:#8b949e;font-size:11px;">${escHtml(p.userId?.email || '')}</div>
              </td>
              <td>
                ${p.isPublic
                  ? '<span class="badge badge-green">🔓 공개</span>'
                  : '<span class="badge badge-gray">🔒 비공개</span>'}
              </td>
              <td style="min-width:200px;max-width:340px;">${renderPlaces(p.places)}</td>
              <td><span class="ts">${fmtDate(p.updatedAt)}</span></td>
              <td><span class="ts">${fmtDate(p.createdAt)}</span></td>
            </tr>`).join('')}
          </tbody>
        </table>`}
    </div>
  </section>

</main>

<div class="footer">
  ⚠ Local development only &nbsp;·&nbsp; 프로덕션 환경에서는 이 페이지를 비활성화하세요
</div>

</body>
</html>`);

  } catch (err) {
    res.status(500).send(`
      <html><body style="background:#0d1117;color:#f85149;font-family:monospace;padding:32px;">
        <h2 style="margin-bottom:12px;">Admin Error</h2>
        <pre>${escHtml(err.stack || err.message)}</pre>
      </body></html>
    `);
  }
});

module.exports = router;
