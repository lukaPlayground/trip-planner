const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const ODSAY_API_KEY = process.env.ODSAY_API_KEY;
const ITS_API_KEY   = process.env.ITS_API_KEY;
const ODSAY_BASE = 'https://api.odsay.com/v1/api';

// ODsay는 등록된 도메인(Origin) 기반 인증을 사용한다.
// 백엔드에서 Origin: http://localhost:5173 헤더를 추가해서 프록시 처리한다.
const ODSAY_ORIGIN = 'http://localhost:5173';

// 코레일 역 목록 (공공데이터포털 '한국철도공사_역 위치 정보', 202개 역)
const KORAIL_STATIONS = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../data/korail-stations.json'), 'utf-8')
);

// KTX/SRT 주요 환승 거점역 (경도, 위도) — 광역 분할 pivot 후보
// 실제 역 좌표 기준으로 정렬 (서울권 → 충청권 → 영남권 → 호남권)
const KTX_PIVOTS = [
  { name: '수서역',    x: 127.1016, y: 37.4876 },
  { name: '광명역',   x: 126.8629, y: 37.4158 },
  { name: '천안아산역', x: 127.0008, y: 36.7955 },
  { name: '오송역',   x: 127.2989, y: 36.6247 },
  { name: '대전역',   x: 127.4344, y: 36.3323 },
  { name: '서대전역', x: 127.3950, y: 36.3243 },
  { name: '동대구역', x: 128.6244, y: 35.8799 },
  { name: '구미역',   x: 128.3373, y: 36.1167 },
  { name: '김천구미역', x: 128.1557, y: 36.1392 },
  { name: '울산역',   x: 129.4217, y: 35.5564 },
  { name: '부산역',   x: 129.0403, y: 35.1148 },
  { name: '광주송정역', x: 126.7940, y: 35.1395 },
  { name: '익산역',   x: 126.9544, y: 35.9344 },
  { name: '전주역',   x: 127.1540, y: 35.7872 },
  { name: '목포역',   x: 126.3921, y: 34.7907 },
];

// 두 좌표 간 거리 계산 (Haversine, km)
const haversineKm = (lat1, lng1, lat2, lng2) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ODsay API 단일 호출 헬퍼
// searchType: 0=도시내, 1=도시간(광역)
// searchPathType: 0=최적, 1=지하철, 2=버스
const callOdsay = async (sx, sy, ex, ey, searchType, searchPathType) => {
  const url = new URL(`${ODSAY_BASE}/searchPubTransPathT`);
  url.searchParams.set('apiKey', ODSAY_API_KEY);
  url.searchParams.set('SX', sx);
  url.searchParams.set('SY', sy);
  url.searchParams.set('EX', ex);
  url.searchParams.set('EY', ey);
  url.searchParams.set('SearchType', searchType);
  url.searchParams.set('SearchPathType', searchPathType);
  url.searchParams.set('OdsayVersion', '1.0');

  const response = await fetch(url.toString(), {
    headers: {
      'Origin': ODSAY_ORIGIN,
      'Referer': `${ODSAY_ORIGIN}/`,
    },
  });
  return response.json();
};

const hasResult = (d) => d?.result?.path && d.result.path.length > 0;

// 도시내→광역 순서로 시도해서 첫 번째 유효한 결과 반환
const callOdsayWithFallback = async (sx, sy, ex, ey, searchPathType) => {
  let data = await callOdsay(sx, sy, ex, ey, 0, searchPathType);
  if (!hasResult(data)) {
    data = await callOdsay(sx, sy, ex, ey, 1, searchPathType);
  }
  return data;
};

// ODsay 응답에서 좌표 배열 + transitDetail + info 추출
const extractRouteData = (data) => {
  if (!hasResult(data)) return null;

  const bestPath = data.result.path[0];
  const info = {
    totalTime: bestPath.info?.totalTime ?? null,         // 분
    payment: bestPath.info?.payment ?? null,             // 원
    totalDistance: bestPath.info?.totalDistance ?? null, // m
    transferCount: bestPath.info?.transferCount ?? null,
    busTransitCount: bestPath.info?.busTransitCount ?? null,
    subwayTransitCount: bestPath.info?.subwayTransitCount ?? null,
  };

  const allCoords = [];
  const transitDetail = [];
  const subPaths = bestPath.subPath || [];

  for (const subPath of subPaths) {
    const trafficType = subPath.trafficType;
    const stations = subPath.passStopList?.stations;

    if (stations && stations.length > 0) {
      for (const st of stations) {
        const x = parseFloat(st.x);
        const y = parseFloat(st.y);
        if (!isNaN(x) && !isNaN(y)) allCoords.push([y, x]); // [lat, lng]
      }

      const firstStation = stations[0];
      const lastStation = stations[stations.length - 1];

      if (trafficType === 2) {
        // 버스 구간
        const laneList = subPath.lane || [];
        const busNos = laneList
          .map(l => l.busNo || l.name || '')
          .filter(Boolean)
          .filter((v, i, arr) => arr.indexOf(v) === i);

        transitDetail.push({
          type: 'bus',
          lines: busNos.length > 0 ? busNos : ['버스'],
          boardStation: firstStation.stationName || firstStation.name || '',
          alightStation: lastStation.stationName || lastStation.name || '',
          stationCount: stations.length,
          sectionTime: subPath.sectionTime || null,
        });
      } else if (trafficType === 1) {
        // 지하철 구간
        const laneList = subPath.lane || [];
        const lineNames = laneList
          .map(l => l.name || '')
          .filter(Boolean)
          .filter((v, i, arr) => arr.indexOf(v) === i);

        transitDetail.push({
          type: 'subway',
          lines: lineNames.length > 0 ? lineNames : ['지하철'],
          boardStation: firstStation.stationName || firstStation.name || '',
          alightStation: lastStation.stationName || lastStation.name || '',
          stationCount: stations.length,
          sectionTime: subPath.sectionTime || null,
        });
      }
    } else if (trafficType === 3) {
      // 도보 구간
      const walkSx = parseFloat(subPath.startX);
      const walkSy = parseFloat(subPath.startY);
      const walkEx = parseFloat(subPath.endX);
      const walkEy = parseFloat(subPath.endY);
      if (!isNaN(walkSx) && !isNaN(walkSy)) allCoords.push([walkSy, walkSx]);
      if (!isNaN(walkEx) && !isNaN(walkEy)) allCoords.push([walkEy, walkEx]);

      if (subPath.sectionTime > 0 || subPath.distance > 0) {
        transitDetail.push({
          type: 'walk',
          lines: [],
          boardStation: '',
          alightStation: '',
          stationCount: 0,
          sectionTime: subPath.sectionTime || null,
          distance: subPath.distance || null,
        });
      }
    }
  }

  return { allCoords, info, transitDetail };
};

// 연속 중복 좌표 제거
const dedup = (coords) =>
  coords.filter((coord, i) => {
    if (i === 0) return true;
    const prev = coords[i - 1];
    return coord[0] !== prev[0] || coord[1] !== prev[1];
  });

// 두 구간 결과 합산
const mergeRoutes = (routeA, routeB) => ({
  allCoords: [
    ...(routeA?.allCoords || []),
    ...(routeB?.allCoords || []),
  ],
  info: {
    totalTime: (routeA?.info?.totalTime ?? 0) + (routeB?.info?.totalTime ?? 0) || null,
    payment: (routeA?.info?.payment ?? 0) + (routeB?.info?.payment ?? 0) || null,
    totalDistance: (routeA?.info?.totalDistance ?? 0) + (routeB?.info?.totalDistance ?? 0) || null,
    transferCount: (routeA?.info?.transferCount ?? 0) + (routeB?.info?.transferCount ?? 0),
    busTransitCount: (routeA?.info?.busTransitCount ?? 0) + (routeB?.info?.busTransitCount ?? 0),
    subwayTransitCount: (routeA?.info?.subwayTransitCount ?? 0) + (routeB?.info?.subwayTransitCount ?? 0),
  },
  transitDetail: [
    ...(routeA?.transitDetail || []),
    ...(routeB?.transitDetail || []),
  ],
});

// ODsay 경로 검색 (대중교통: 버스+지하철 통합)
// GET /api/transit/route?sx=경도&sy=위도&ex=경도&ey=위도
//
// 검색 전략 (3단계):
//   1단계: 전체 구간 단일 탐색 (도시내 → 광역 폴백)
//   2단계: 50km 미만 → 중앙값 pivot 단순 분할
//          50km 이상 → KTX 주요역 pivot 순서대로 시도 (최대 3개)
//   3단계: 모두 실패 → longDistance:true 반환 (기차 이용 안내)
//
// 반환 단위: totalTime=분, totalDistance=m (Map.jsx에서 변환)
router.get('/route', async (req, res) => {
  try {
    const { sx, sy, ex, ey } = req.query;

    if (!sx || !sy || !ex || !ey) {
      return res.status(400).json({ message: '출발/도착 좌표가 필요합니다 (sx, sy, ex, ey)' });
    }

    const sxNum = parseFloat(sx);
    const syNum = parseFloat(sy);
    const exNum = parseFloat(ex);
    const eyNum = parseFloat(ey);

    // SearchPathType=0: 최적(버스+지하철 혼합)
    const searchPathType = 0;

    // ── 1단계: 전체 구간 단일 검색 ──
    const fullData = await callOdsayWithFallback(sx, sy, ex, ey, searchPathType);

    if (fullData.error) {
      console.error('ODsay API Error:', JSON.stringify(fullData.error));
      return res.status(502).json({ message: 'ODsay API 호출 실패', error: fullData.error });
    }

    if (hasResult(fullData)) {
      const routeData = extractRouteData(fullData);
      const coords = dedup(routeData.allCoords);
      return res.json({
        coords: coords.length >= 2 ? coords : null,
        info: routeData.info,
        transitDetail: routeData.transitDetail,
        longDistance: false,
      });
    }

    // ── 2단계: 분할 탐색 ──
    console.log('ODsay 전체 경로 없음 → 분할 탐색 시도');

    const distKm = haversineKm(syNum, sxNum, eyNum, exNum);
    console.log(`출발-도착 직선 거리: ${distKm.toFixed(1)}km`);

    // pivot 후보 목록 결정
    // 50km 이상: 두 지점 사이에 위치하는 KTX역을 거리 기준으로 필터링 후 우선순위 정렬
    // 50km 미만: 단순 중앙값 pivot 1개
    let pivotCandidates = [];

    if (distKm >= 50) {
      // 출발-도착 직선 경로의 bounding box (약간 여유 ±0.5도) 안에 있는 KTX역만 필터
      const minLat = Math.min(syNum, eyNum) - 0.5;
      const maxLat = Math.max(syNum, eyNum) + 0.5;
      const minLng = Math.min(sxNum, exNum) - 0.5;
      const maxLng = Math.max(sxNum, exNum) + 0.5;

      const filtered = KTX_PIVOTS.filter(p =>
        p.y >= minLat && p.y <= maxLat && p.x >= minLng && p.x <= maxLng
      );

      // 두 endpoint 중간값과의 거리 순으로 정렬 (중간에 가장 가까운 역 우선)
      const midLat = (syNum + eyNum) / 2;
      const midLng = (sxNum + exNum) / 2;
      filtered.sort((a, b) =>
        haversineKm(midLat, midLng, a.y, a.x) - haversineKm(midLat, midLng, b.y, b.x)
      );

      // 상위 3개 + 항상 단순 중앙값도 마지막 후보로 추가
      pivotCandidates = filtered.slice(0, 3).map(p => ({
        name: p.name, x: p.x.toFixed(6), y: p.y.toFixed(6),
      }));
      console.log(`KTX pivot 후보: ${pivotCandidates.map(p => p.name).join(', ')}`);
    }

    // 50km 미만이거나 KTX pivot 후보가 없으면 단순 중앙값 추가
    pivotCandidates.push({
      name: '중간지점',
      x: ((sxNum + exNum) / 2).toFixed(6),
      y: ((syNum + eyNum) / 2).toFixed(6),
    });

    // pivot 후보 순서대로 시도 — 첫 번째 성공한 결과 사용
    for (const pivot of pivotCandidates) {
      console.log(`  pivot 시도: ${pivot.name} (${pivot.x}, ${pivot.y})`);

      const [dataA, dataB] = await Promise.all([
        callOdsayWithFallback(sx, sy, pivot.x, pivot.y, searchPathType),
        callOdsayWithFallback(pivot.x, pivot.y, ex, ey, searchPathType),
      ]);

      const routeA = hasResult(dataA) ? extractRouteData(dataA) : null;
      const routeB = hasResult(dataB) ? extractRouteData(dataB) : null;

      if (!routeA && !routeB) continue;

      // 하나라도 성공하면 합산 반환
      const merged = mergeRoutes(routeA, routeB);
      const coords = dedup(merged.allCoords);

      console.log(`  ✓ pivot [${pivot.name}] 성공: A${routeA ? '✓' : '✗'} B${routeB ? '✓' : '✗'}, 좌표 ${coords.length}개`);

      return res.json({
        coords: coords.length >= 2 ? coords : null,
        info: merged.info,
        transitDetail: merged.transitDetail,
        longDistance: distKm >= 50,
      });
    }

    // ── 3단계: 모든 pivot 실패 ──
    console.log('ODsay 분할 탐색 모두 실패');
    return res.json({
      coords: null,
      info: null,
      transitDetail: null,
      longDistance: distKm >= 50, // 50km 이상이면 기차 안내 표시
    });

  } catch (error) {
    console.error('Transit route error:', error.message);
    res.status(500).json({ message: '대중교통 경로 조회 실패', error: error.message });
  }
});

// ── 기차 구간 정보 조회 ──
// GET /api/transit/train?fromLat=&fromLng=&toLat=&toLng=
//
// 출발/도착 좌표에서 가장 가까운 코레일 역을 탐색하고,
// 두 역 사이의 거리 기반 예상 소요시간을 반환한다.
// API 필터링 미지원으로 실시간 시간표 대신 거리 기반 추정치를 제공한다.
//
// 평균 속도 기준: KTX~무궁화 혼합 → 150km/h (보수적 추정)
router.get('/train', (req, res) => {
  const { fromLat, fromLng, toLat, toLng } = req.query;

  if (!fromLat || !fromLng || !toLat || !toLng) {
    return res.status(400).json({ message: '출발/도착 좌표가 필요합니다' });
  }

  const fLat = parseFloat(fromLat);
  const fLng = parseFloat(fromLng);
  const tLat = parseFloat(toLat);
  const tLng = parseFloat(toLng);

  // 가장 가까운 역 탐색
  const nearest = (lat, lng) =>
    KORAIL_STATIONS.reduce((best, stn) => {
      const d = haversineKm(lat, lng, stn.lat, stn.lng);
      return d < best.dist ? { stn, dist: d } : best;
    }, { stn: null, dist: Infinity }).stn;

  const deptStn = nearest(fLat, fLng);
  const arrStn  = nearest(tLat, tLng);

  if (!deptStn || !arrStn) {
    return res.status(500).json({ message: '역 탐색 실패' });
  }

  // 역 간 직선 거리 (km)
  const distKm = haversineKm(deptStn.lat, deptStn.lng, arrStn.lat, arrStn.lng);

  // 평균 150km/h 기준 소요시간 (분)
  const estimatedMinutes = Math.round((distKm / 150) * 60);

  res.json({
    deptStation: { name: deptStn.name, lat: deptStn.lat, lng: deptStn.lng, region: deptStn.region },
    arrStation:  { name: arrStn.name,  lat: arrStn.lat,  lng: arrStn.lng,  region: arrStn.region  },
    distKm:      Math.round(distKm * 10) / 10,
    estimatedMinutes,
  });
});

// ── ITS 전광판(VMS) 도로 이벤트 조회 ──
// GET /api/transit/road-events?minX=&maxX=&minY=&maxY=
//
// 경로 bounding box 내 VMS 전광판 데이터를 반환한다.
// 동일 vmsId의 여러 메시지(messageNo)를 하나로 합쳐서 반환.
// roadGrad: 101=고속도로, 103=국도
//
// 에러 발생 시 빈 배열 반환 (UI 차단 방지)
router.get('/road-events', async (req, res) => {
  try {
    const { minX, maxX, minY, maxY } = req.query;

    if (!minX || !maxX || !minY || !maxY) {
      return res.json({ events: [] });
    }

    const url = `https://openapi.its.go.kr:9443/vmsInfo?apiKey=${ITS_API_KEY}&type=all&minX=${minX}&maxX=${maxX}&minY=${minY}&maxY=${maxY}&getType=json`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.header?.resultCode !== 0 || !Array.isArray(data.body?.items)) {
      return res.json({ events: [] });
    }

    const minXNum = parseFloat(minX);
    const maxXNum = parseFloat(maxX);
    const minYNum = parseFloat(minY);
    const maxYNum = parseFloat(maxY);

    // vmsId별 메시지 그룹화 + bbox 필터 (ITS API가 bbox를 완전히 지원하지 않아 직접 필터링)
    const vmsMap = {};
    for (const item of data.body.items) {
      const lat = parseFloat(item.coordY);
      const lng = parseFloat(item.coordX);
      if (isNaN(lat) || isNaN(lng)) continue;
      if (lat < minYNum || lat > maxYNum || lng < minXNum || lng > maxXNum) continue; // bbox 벗어나면 제외

      if (!vmsMap[item.vmsId]) {
        vmsMap[item.vmsId] = {
          lat, lng,
          roadGrad:  item.roadGrad   || '',
          roadName:  item.roadName   || '',
          routeNo:   item.routeNo    || '',
          updatedAt: item.createdDate || '',
          parts:     new Set(),
        };
      }
      item.message.split('|').map(s => s.trim()).filter(Boolean)
        .forEach(p => vmsMap[item.vmsId].parts.add(p));
    }

    const events = Object.values(vmsMap)
      .filter(v => v.parts.size > 0)
      .map(({ parts, ...v }) => ({ ...v, message: [...parts].join(' · ') }));

    res.json({ events });

  } catch (error) {
    console.error('Road events error:', error.message);
    res.json({ events: [] });
  }
});

module.exports = router;
