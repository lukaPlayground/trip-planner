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

// ODsay 경로 검색 (대중교통: 버스+지하철)
// GET /api/transit/route?sx=경도&sy=위도&ex=경도&ey=위도&mode=bus|subway
// SearchPathType: 0=최적(혼합), 1=지하철, 2=버스
// SearchType: 0=도시내, 1=도시간(광역) — 결과 없으면 광역으로 자동 폴백
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

    // 1차: 도시내(SearchType=0) 검색
    let data = await callOdsay(sx, sy, ex, ey, 0, searchPathType);

    // 도시내 결과 없거나 에러면 → 도시간(SearchType=1) 광역 검색으로 폴백
    const hasResult = (d) => d?.result?.path && d.result.path.length > 0;
    if (!hasResult(data)) {
      console.log('ODsay 도시내 결과 없음 → 광역(SearchType=1) 재시도');
      data = await callOdsay(sx, sy, ex, ey, 1, searchPathType);
    }

    if (data.error) {
      console.error('ODsay API Error:', JSON.stringify(data.error));
      return res.status(502).json({ message: 'ODsay API 호출 실패', error: data.error });
    }

    const paths = data.result?.path;
    if (!paths || paths.length === 0) {
      return res.json({ coords: null, info: null, transitDetail: null });
    }

    // 최적 경로 (첫 번째)
    const bestPath = paths[0];
    const info = {
      totalTime: bestPath.info?.totalTime,         // 분
      payment: bestPath.info?.payment,             // 원
      totalDistance: bestPath.info?.totalDistance, // m
      transferCount: bestPath.info?.transferCount, // 환승 횟수
      busTransitCount: bestPath.info?.busTransitCount,
      subwayTransitCount: bestPath.info?.subwayTransitCount,
    };

    // 구간별 좌표 + 환승 상세 정보 수집
    // trafficType: 1=지하철, 2=버스, 3=도보
    const allCoords = [];
    const subPaths = bestPath.subPath || [];
    const transitDetail = []; // 환승 구간별 정보 배열

    for (const subPath of subPaths) {
      const trafficType = subPath.trafficType;
      const stations = subPath.passStopList?.stations;

      if (stations && stations.length > 0) {
        // 버스/지하철 구간: 정류장 좌표 사용
        for (const st of stations) {
          const x = parseFloat(st.x);
          const y = parseFloat(st.y);
          if (!isNaN(x) && !isNaN(y)) {
            allCoords.push([y, x]); // Leaflet: [lat, lng]
          }
        }

        // 환승 상세 정보 추출
        const firstStation = stations[0];
        const lastStation = stations[stations.length - 1];

        if (trafficType === 2) {
          // 버스 구간: lane 배열에서 버스번호 수집
          const laneList = subPath.lane || [];
          const busNos = laneList
            .map(l => l.busNo || l.name || '')
            .filter(Boolean)
            .filter((v, i, arr) => arr.indexOf(v) === i); // 중복 제거

          transitDetail.push({
            type: 'bus',
            lines: busNos.length > 0 ? busNos : ['버스'],
            boardStation: firstStation.stationName || firstStation.name || '',
            alightStation: lastStation.stationName || lastStation.name || '',
            stationCount: stations.length,
            sectionTime: subPath.sectionTime || null, // 분
          });
        } else if (trafficType === 1) {
          // 지하철 구간: lane 배열에서 호선명 수집
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
            sectionTime: subPath.sectionTime || null, // 분
          });
        }
      } else if (trafficType === 3) {
        // 도보 구간: startX/Y, endX/Y 사용
        const walkSx = parseFloat(subPath.startX);
        const walkSy = parseFloat(subPath.startY);
        const walkEx = parseFloat(subPath.endX);
        const walkEy = parseFloat(subPath.endY);
        if (!isNaN(walkSx) && !isNaN(walkSy)) allCoords.push([walkSy, walkSx]);
        if (!isNaN(walkEx) && !isNaN(walkEy)) allCoords.push([walkEy, walkEx]);

        // 도보 구간 정보 (환승 대기 이동 포함)
        if (subPath.sectionTime > 0 || subPath.distance > 0) {
          transitDetail.push({
            type: 'walk',
            lines: [],
            boardStation: '',
            alightStation: '',
            stationCount: 0,
            sectionTime: subPath.sectionTime || null, // 분
            distance: subPath.distance || null, // m
          });
        }
      }
    }

    // 중복 좌표 제거 (연속 동일 좌표)
    const dedupedCoords = allCoords.filter((coord, i) => {
      if (i === 0) return true;
      const prev = allCoords[i - 1];
      return coord[0] !== prev[0] || coord[1] !== prev[1];
    });

    res.json({
      coords: dedupedCoords.length >= 2 ? dedupedCoords : null,
      info,
      transitDetail, // 환승 구간별 상세 정보
    });
  } catch (error) {
    console.error('Transit route error:', error.message);
    res.status(500).json({ message: '대중교통 경로 조회 실패', error: error.message });
  }
});

module.exports = router;
