const express = require('express');
const router = express.Router();

const ODSAY_API_KEY = process.env.ODSAY_API_KEY;
const ODSAY_BASE = 'https://api.odsay.com/v1/api';

// ODsay는 등록된 도메인(Origin) 기반 인증을 사용한다.
// 백엔드에서 Origin: http://localhost:5173 헤더를 추가해서 프록시 처리한다.
const ODSAY_ORIGIN = 'http://localhost:5173';

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
    console.log(`ODsay 도시내 결과 없음 (${sx},${sy}→${ex},${ey}) → 광역(SearchType=1) 재시도`);
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

// ODsay 경로 검색 (대중교통: 버스+지하철)
// GET /api/transit/route?sx=경도&sy=위도&ex=경도&ey=위도&mode=bus|subway
// SearchPathType: 0=최적(혼합), 1=지하철, 2=버스
// SearchType: 0=도시내, 1=도시간(광역) — 결과 없으면 광역으로 자동 폴백
// 광역+도시내 연계: 두 지역을 경유하는 경우 중간 분할 탐색으로 구간 이어 붙임
router.get('/route', async (req, res) => {
  try {
    const { sx, sy, ex, ey, mode } = req.query;

    if (!sx || !sy || !ex || !ey) {
      return res.status(400).json({ message: '출발/도착 좌표가 필요합니다 (sx, sy, ex, ey)' });
    }

    // mode에 따라 SearchPathType 결정
    let searchPathType = 0; // 기본: 최적(버스+지하철 혼합)
    if (mode === 'subway') searchPathType = 1; // 지하철 우선
    if (mode === 'bus') searchPathType = 2;    // 버스 우선

    // ── 1단계: 전체 구간 단일 검색 (도시내 → 광역 폴백) ──
    const fullData = await callOdsayWithFallback(sx, sy, ex, ey, searchPathType);

    if (fullData.error) {
      console.error('ODsay API Error:', JSON.stringify(fullData.error));
      return res.status(502).json({ message: 'ODsay API 호출 실패', error: fullData.error });
    }

    if (hasResult(fullData)) {
      // 단일 검색으로 경로를 찾은 경우 바로 반환
      const routeData = extractRouteData(fullData);
      const coords = dedup(routeData.allCoords);
      return res.json({
        coords: coords.length >= 2 ? coords : null,
        info: routeData.info,
        transitDetail: routeData.transitDetail,
      });
    }

    // ── 2단계: 단일 검색 실패 → 중간 지점(pivot) 분할 탐색 ──
    // 출발지와 도착지가 서로 다른 도시권에 걸쳐 있을 때
    // (예: 서울역 → 오송역)
    // → 출발지 도시 내 대중교통 + 도착지 도시 내 대중교통 두 구간으로 분리해 이어 붙인다
    console.log('ODsay 전체 경로 없음 → 분할 탐색(pivot) 시도');

    const sxNum = parseFloat(sx);
    const syNum = parseFloat(sy);
    const exNum = parseFloat(ex);
    const eyNum = parseFloat(ey);

    // pivot: 출발-도착 중간 좌표
    const pivotX = ((sxNum + exNum) / 2).toFixed(6);
    const pivotY = ((syNum + eyNum) / 2).toFixed(6);

    // 출발 → pivot, pivot → 도착 병렬 검색
    const [dataA, dataB] = await Promise.all([
      callOdsayWithFallback(sx, sy, pivotX, pivotY, searchPathType),
      callOdsayWithFallback(pivotX, pivotY, ex, ey, searchPathType),
    ]);

    const routeA = hasResult(dataA) ? extractRouteData(dataA) : null;
    const routeB = hasResult(dataB) ? extractRouteData(dataB) : null;

    if (!routeA && !routeB) {
      // 분할 탐색도 실패 → 결과 없음 반환
      console.log('ODsay 분할 탐색도 실패');
      return res.json({ coords: null, info: null, transitDetail: null });
    }

    // 두 구간 합산
    const mergedCoords = [
      ...(routeA?.allCoords || []),
      ...(routeB?.allCoords || []),
    ];

    const mergedInfo = {
      totalTime:
        (routeA?.info?.totalTime ?? 0) + (routeB?.info?.totalTime ?? 0) || null,
      payment:
        (routeA?.info?.payment ?? 0) + (routeB?.info?.payment ?? 0) || null,
      totalDistance:
        (routeA?.info?.totalDistance ?? 0) + (routeB?.info?.totalDistance ?? 0) || null,
      transferCount:
        (routeA?.info?.transferCount ?? 0) + (routeB?.info?.transferCount ?? 0),
      busTransitCount:
        (routeA?.info?.busTransitCount ?? 0) + (routeB?.info?.busTransitCount ?? 0),
      subwayTransitCount:
        (routeA?.info?.subwayTransitCount ?? 0) + (routeB?.info?.subwayTransitCount ?? 0),
    };

    const mergedTransitDetail = [
      ...(routeA?.transitDetail || []),
      ...(routeB?.transitDetail || []),
    ];

    const coords = dedup(mergedCoords);
    console.log(`ODsay 분할 탐색 성공: A구간 ${routeA ? '✓' : '✗'}, B구간 ${routeB ? '✓' : '✗'}, 좌표 ${coords.length}개`);

    return res.json({
      coords: coords.length >= 2 ? coords : null,
      info: mergedInfo,
      transitDetail: mergedTransitDetail,
    });

  } catch (error) {
    console.error('Transit route error:', error.message);
    res.status(500).json({ message: '대중교통 경로 조회 실패', error: error.message });
  }
});

module.exports = router;
