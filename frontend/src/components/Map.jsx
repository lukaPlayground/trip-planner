import { useEffect, useMemo, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// 이동수단별 스타일 (색상 + 선 패턴 + 두께)
// bus/subway → 대중교통 통합, car/taxi → 자동차 통합
const TRANSPORT_STYLES = {
  walk:       { color: '#10b981', dashArray: '4, 8',          weight: 4, label: '도보',    pattern: '· · · ·' },
  bicycle:    { color: '#34d399', dashArray: '10, 6',         weight: 4, label: '자전거',  pattern: '- - - -' },
  motorcycle: { color: '#a855f7', dashArray: '14, 6, 4, 6',  weight: 4, label: '바이크',  pattern: '─ · ─ ·' },
  bus:        { color: '#3b82f6', dashArray: undefined,       weight: 6, label: '대중교통', pattern: '━━━━' },
  subway:     { color: '#3b82f6', dashArray: undefined,       weight: 6, label: '대중교통', pattern: '━━━━' },
  train:      { color: '#8b5cf6', dashArray: '24, 8',         weight: 6, label: '기차',    pattern: '━━ ━━' },
  car:        { color: '#f97316', dashArray: undefined,       weight: 5, label: '자동차',  pattern: '━━━━' },
  taxi:       { color: '#f97316', dashArray: undefined,       weight: 5, label: '자동차',  pattern: '━━━━' },
  ship:       { color: '#06b6d4', dashArray: '6, 6',          weight: 5, label: '배',      pattern: '~ ~ ~' },
  plane:      { color: '#ec4899', dashArray: '20, 14',        weight: 4, label: '비행기',  pattern: '── ──' },
};

// 교통수단 → Valhalla costing 매핑
const VALHALLA_COSTING_MAP = {
  walk:       'pedestrian',
  bicycle:    'bicycle',
  motorcycle: 'motor_scooter',
  bus:        null,   // ODsay
  subway:     null,   // ODsay
  train:      null,   // 직선
  car:        'auto',
  taxi:       'auto',
  ship:       null,   // 직선
  plane:      null,   // 직선
};

// ── ODsay 대중교통 경로 캐시 ──
const transitCache = {};

// ODsay API: bus/subway 통합, SearchPathType=0 최적 경로
// 반환: { coords, info, transitDetail, longDistance } 또는 null
// longDistance=true: 50km 이상 광역 구간에서 ODsay 경로 없음 → 기차 안내 표시용
const fetchTransitRoute = async (fromLat, fromLng, toLat, toLng) => {
  const cacheKey = `transit-${fromLat},${fromLng}-${toLat},${toLng}`;
  if (transitCache[cacheKey] !== undefined) return transitCache[cacheKey];

  try {
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';
    const url = `${apiBase}/transit/route?sx=${fromLng}&sy=${fromLat}&ex=${toLng}&ey=${toLat}`;
    const response = await fetch(url);

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    // coords가 없어도 info(시간/거리)가 있으면 반환 (직선+info 표시)
    // longDistance: 50km 이상 광역에서 ODsay 경로를 찾지 못한 경우 true
    const result = (data.info != null || data.longDistance)
      ? {
          coords: data.coords || null,
          info: data.info || null,
          transitDetail: data.transitDetail || [],
          longDistance: data.longDistance || false,
        }
      : { coords: null, info: null, transitDetail: [], longDistance: data.longDistance || false };
    transitCache[cacheKey] = result;
    return result;
  } catch (error) {
    console.warn('ODsay 경로 요청 실패:', error.message);
    transitCache[cacheKey] = null;
    return null;
  }
};

// ── Valhalla polyline6 디코딩 ──
const decodePolyline6 = (encoded) => {
  const inv = 1e6;
  const coords = [];
  let index = 0, lat = 0, lng = 0;

  while (index < encoded.length) {
    for (let i = 0; i < 2; i++) {
      let shift = 0, result = 0, byte;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (i === 0) lat += delta;
      else lng += delta;
    }
    coords.push([lat / inv, lng / inv]);
  }
  return coords;
};

// ── 기차 경로 캐시 ──
const trainCache = {};

// 코레일 역 탐색 API: 출발/도착 좌표 → 가장 가까운 역 반환
// 반환: { deptStation, arrStation, distKm, estimatedMinutes } 또는 null
const fetchTrainRoute = async (fromLat, fromLng, toLat, toLng) => {
  const cacheKey = `train-${fromLat},${fromLng}-${toLat},${toLng}`;
  if (trainCache[cacheKey] !== undefined) return trainCache[cacheKey];

  try {
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';
    const url = `${apiBase}/transit/train?fromLat=${fromLat}&fromLng=${fromLng}&toLat=${toLat}&toLng=${toLng}`;
    const response = await fetch(url);

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    trainCache[cacheKey] = data;
    return data;
  } catch (error) {
    console.warn('기차 역 탐색 실패:', error.message);
    trainCache[cacheKey] = null;
    return null;
  }
};

// ── 경로 캐시 ──
const routeCache = {};

// ── Haversine 거리 계산 (km) ──
const haversineKm = (lat1, lng1, lat2, lng2) => {
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// 자전거/도보 장거리 분할 설정
const VALHALLA_MAX_KM  = 190;  // Valhalla 허용 상한 (안전 마진 포함)
const SPLIT_CHUNK_KM   = 170;  // 분할 시 각 구간 목표 길이
const AVG_SPEED_KMH    = { pedestrian: 5, bicycle: 15 }; // 폴백용 평균 속도

// Valhalla maneuvers에서 주요 도로명 추출
const extractStreetNames = (raw) => {
  const names = [];
  const regex = /"street_names":\[([^\]]*)\]/g;
  let match;
  while ((match = regex.exec(raw)) !== null) {
    const items = match[1].match(/"([^"]+)"/g);
    if (items) {
      items.forEach(item => {
        const name = item.replace(/"/g, '').trim();
        if (name && !names.includes(name)) names.push(name);
      });
    }
  }
  return names.slice(0, 5);
};

// ── Valhalla 단일 구간 호출 (캐시 없음, 거리 제한 없음) ──
// fetchRoute 내부 및 분할 라우팅에서 재사용
const fetchSingleRoute = async (fromLat, fromLng, toLat, toLng, costing, useTolls = true) => {
  try {
    const costingOptions = {};
    if (costing === 'auto') {
      costingOptions.auto = { use_tolls: useTolls ? 1.0 : 0.0 };
    }

    const body = JSON.stringify({
      locations: [
        { lat: fromLat, lon: fromLng },
        { lat: toLat,   lon: toLng   },
      ],
      costing,
      costing_options: Object.keys(costingOptions).length > 0 ? costingOptions : undefined,
      directions_options: { units: 'km' },
    });

    const response = await fetch('https://valhalla1.openstreetmap.de/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    const raw = await response.text();

    // shape 추출
    const shapeMatch = raw.match(/"shape":"([^"]+)"/);
    if (!shapeMatch) return null;

    const coords = decodePolyline6(shapeMatch[1].replace(/\\\\/g, '\\'));
    if (coords.length < 2) return null;

    // ── summary 레벨에서 time/length 추출 ──
    // "summary":{...,"time":7752.791,"length":132.042,...}
    const summaryMatch = raw.match(/"summary":\{([^}]+)\}/);
    let time = null;
    let distance = null;
    let hasToll = false;

    if (summaryMatch) {
      const summaryStr = summaryMatch[1];
      const tMatch = summaryStr.match(/"time":(\d+(?:\.\d+)?)/);
      const lMatch = summaryStr.match(/"length":(\d+(?:\.\d+)?)/);
      const tollMatch = summaryStr.match(/"has_toll":(true|false)/);
      time     = tMatch  ? parseFloat(tMatch[1])  : null;  // 초(seconds)
      distance = lMatch  ? parseFloat(lMatch[1])  : null;  // km
      hasToll  = tollMatch?.[1] === 'true';
    }

    // 바이크: 주요 도로명, 자동차: 유료도로 여부
    const streetNames = costing === 'motor_scooter' ? extractStreetNames(raw) : null;

    return { coords, time, distance, streetNames, hasToll };
  } catch (error) {
    console.warn('Valhalla 단일 구간 요청 실패:', error);
  }
  return null;
};

// ── Valhalla 경로 요청 (캐시 + 장거리 분할 라우팅) ──
// 자전거/도보 200km+ 구간: 중간 waypoint 분할 → 각 구간 Valhalla 호출 → 합산
// 분할 실패 시: Haversine 직선 + 평균 속도 추정 시간 (longDistanceFallback: true)
const fetchRoute = async (fromLat, fromLng, toLat, toLng, costing, useTolls = true) => {
  const cacheKey = `${fromLat},${fromLng}-${toLat},${toLng}-${costing}-${useTolls}`;
  if (routeCache[cacheKey]) return routeCache[cacheKey];

  const distKm = haversineKm(fromLat, fromLng, toLat, toLng);
  const isLongDistance = (costing === 'pedestrian' || costing === 'bicycle') && distKm > VALHALLA_MAX_KM;

  if (isLongDistance) {
    // ── 분할 라우팅: 등간격 waypoints로 경로를 나눠 각각 Valhalla 호출 ──
    const numChunks = Math.ceil(distKm / SPLIT_CHUNK_KM);
    const waypoints = Array.from({ length: numChunks + 1 }, (_, i) => {
      const t = i / numChunks;
      return {
        lat: fromLat + (toLat - fromLat) * t,
        lng: fromLng + (toLng - fromLng) * t,
      };
    });

    try {
      // 각 분할 구간 병렬 호출
      const chunkResults = await Promise.all(
        waypoints.slice(0, -1).map((wp, i) =>
          fetchSingleRoute(wp.lat, wp.lng, waypoints[i + 1].lat, waypoints[i + 1].lng, costing, useTolls)
        )
      );

      const allOk = chunkResults.every(r => r?.coords && r.coords.length >= 2);

      if (allOk) {
        // 모든 구간 성공 → coords/time/distance 합산 (중복 접점 제거)
        const coords   = chunkResults.flatMap((r, i) => i === 0 ? r.coords : r.coords.slice(1));
        const time     = chunkResults.reduce((s, r) => s + (r.time || 0), 0);
        const distance = chunkResults.reduce((s, r) => s + (r.distance || 0), 0);
        const result = { coords, time, distance, streetNames: null, hasToll: false, longDistanceFallback: false };
        routeCache[cacheKey] = result;
        return result;
      }
    } catch (err) {
      console.warn('분할 라우팅 실패:', err);
    }

    // ── 분할도 실패: Haversine 직선 거리 + 평균 속도 추정 폴백 ──
    const speedKmh = AVG_SPEED_KMH[costing] ?? 5;
    const estTimeSec = (distKm / speedKmh) * 3600;
    const result = {
      coords: [[fromLat, fromLng], [toLat, toLng]],
      time: estTimeSec,
      distance: distKm,
      streetNames: null,
      hasToll: false,
      longDistanceFallback: true,  // SegmentCard에 경고 표시
    };
    routeCache[cacheKey] = result;
    return result;
  }

  // ── 일반 구간: 단일 Valhalla 호출 ──
  const result = await fetchSingleRoute(fromLat, fromLng, toLat, toLng, costing, useTolls);
  routeCache[cacheKey] = result;
  return result;
};

// ── 커스텀 마커 ──
// ── VMS 전광판 경고 아이콘 ──
// roadGrad: '101'=고속도로(주황), '103'=국도(노랑), 기타(회색)
const createVmsIcon = (roadGrad) => {
  const bg = roadGrad === '101' ? '#f97316' : roadGrad === '103' ? '#eab308' : '#6b7280';
  return L.divIcon({
    className: '',
    html: `<div style="background:${bg};color:white;border:2px solid rgba(255,255,255,0.9);border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:13px;box-shadow:0 2px 5px rgba(0,0,0,0.35);cursor:pointer;">⚠</div>`,
    iconSize:    [24, 24],
    iconAnchor:  [12, 12],
    popupAnchor: [0, -14],
  });
};

// VMS 업데이트 시각 포맷: "20260224201250" → "24일 20:12 기준"
const fmtVmsTime = (t) => {
  if (!t || t.length < 12) return '';
  return `${t.slice(6, 8)}일 ${t.slice(8, 10)}:${t.slice(10, 12)} 기준`;
};

// ── VMS 전광판 도로 이벤트 조회 ──
// 자동차/바이크 구간이 있을 때 경로 bbox 내 VMS 데이터를 가져온다.
const fetchRoadEvents = async (places) => {
  const hasRoadSegment = places.some(p => ['car', 'taxi', 'motorcycle'].includes(p.transport));
  if (!hasRoadSegment || places.length < 2) return [];

  try {
    const lats = places.map(p => p.lat);
    const lngs = places.map(p => p.lng);
    const pad  = 0.08; // ~9km 여유
    const minX = (Math.min(...lngs) - pad).toFixed(6);
    const maxX = (Math.max(...lngs) + pad).toFixed(6);
    const minY = (Math.min(...lats) - pad).toFixed(6);
    const maxY = (Math.max(...lats) + pad).toFixed(6);

    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';
    const res  = await fetch(`${apiBase}/transit/road-events?minX=${minX}&maxX=${maxX}&minY=${minY}&maxY=${maxY}`);
    const data = await res.json();
    return data.events || [];
  } catch {
    return [];
  }
};

const createNumberedIcon = (number, checked) => {
  const bg = checked ? '#9ca3af' : '#3b82f6';
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      background: ${bg};
      color: white;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 14px;
      border: 3px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      ${checked ? 'opacity: 0.5;' : ''}
    ">${number}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -20],
  });
};

// ── 지도 범위 자동 조정 ──
const FitBounds = ({ places }) => {
  const map = useMap();

  useEffect(() => {
    if (places.length === 0) { map.setView([37.5665, 126.978], 12); return; }
    if (places.length === 1) { map.setView([places[0].lat, places[0].lng], 14); return; }
    const bounds = L.latLngBounds(places.map(p => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [50, 50] });
  }, [places, map]);

  return null;
};

// ── 장소 클릭 시 해당 위치로 부드럽게 이동 ──
const FlyTo = ({ place }) => {
  const map = useMap();

  useEffect(() => {
    if (!place) return;
    const zoom = Math.max(map.getZoom(), 15);
    map.flyTo([place.lat, place.lng], zoom, { animate: true, duration: 0.7 });
  }, [place, map]);  // place 객체 참조가 바뀔 때마다 실행 (ts 필드로 보장)

  return null;
};

// ── Map 컴포넌트 ──
const Map = ({ places, onRouteUpdate, mapContainerRef, onSegmentClick, selectedSegmentIndex, focusedPlace }) => {
  const [routeSegments, setRouteSegments] = useState([]);
  const [roadEvents, setRoadEvents]       = useState([]);   // ITS VMS 전광판 이벤트
  const [refreshKey, setRefreshKey]       = useState(0);    // 캐시 초기화 + 재계산 트리거
  const [isRefreshing, setIsRefreshing]   = useState(false); // 새로고침 버튼 스피닝
  const [legendOpen, setLegendOpen]       = useState(false); // 범례 토글 (기본: 접힘)
  const abortRef    = useRef(null);
  const refreshingRef = useRef(false);   // buildSegments 내부에서 완료 감지용

  // 모든 모듈 캐시 초기화 + 경로 재계산
  const handleClearCache = () => {
    Object.keys(routeCache).forEach(k => delete routeCache[k]);
    Object.keys(transitCache).forEach(k => delete transitCache[k]);
    Object.keys(trainCache).forEach(k => delete trainCache[k]);
    refreshingRef.current = true;
    setIsRefreshing(true);
    setRefreshKey(k => k + 1);
  };

  useEffect(() => {
    if (abortRef.current) abortRef.current.cancelled = true;
    const thisRequest = { cancelled: false };
    abortRef.current = thisRequest;

    if (places.length < 2) {
      setRouteSegments([]);
      if (onRouteUpdate) onRouteUpdate({ totalTime: 0, totalDistance: 0, segments: [] });
      return;
    }

    const buildSegments = async () => {
      // 초기 세그먼트 배열: 캐시 히트 → 즉시 정확한 결과, 캐시 미스 → 직선 placeholder
      const segments = places.slice(0, -1).map((from, i) => {
        const to = places[i + 1];
        const transport = to.transport || 'bus';
        const style = TRANSPORT_STYLES[transport] || TRANSPORT_STYLES.bus;

        // 캐시에 이미 결과가 있으면 초기값으로 사용 (직선 깜빡임 방지)
        const cacheKey = `transit-${from.lat},${from.lng}-${to.lat},${to.lng}`;
        const cached = (transport === 'bus' || transport === 'subway') ? transitCache[cacheKey] : undefined;
        if (cached !== undefined && cached !== null) {
          const t = cached.info?.totalTime;
          const d = cached.info?.totalDistance;
          return {
            positions:    cached.coords || [[from.lat, from.lng], [to.lat, to.lng]],
            style, transport, from: from.name, to: to.name,
            isRoadRoute:  !!(cached.coords && cached.coords.length > 2),
            time:         (t != null && t > 0) ? t * 60 : null,
            distance:     (d != null && d > 0) ? d / 1000 : null,
            transitDetail: cached.transitDetail || null,
            longDistance:  cached.longDistance || false,
            streetNames: null, hasToll: false,
            loading: false,
          };
        }

        // 캐시 없음 → 직선 placeholder (로딩 중)
        return {
          positions: [[from.lat, from.lng], [to.lat, to.lng]],
          style, transport, from: from.name, to: to.name,
          isRoadRoute: false, time: null, distance: null,
          transitDetail: null, longDistance: false, streetNames: null, hasToll: false, trainInfo: null,
          loading: true,
        };
      });

      // 초기 상태를 즉시 반영 (캐시 결과 포함)
      if (!thisRequest.cancelled) {
        setRouteSegments([...segments]);
        if (onRouteUpdate) {
          const totalTime     = segments.reduce((s, seg) => s + (seg.time || 0), 0);
          const totalDistance = segments.reduce((s, seg) => s + (seg.distance || 0), 0);
          onRouteUpdate({ totalTime, totalDistance, segments: [...segments] });
        }
      }

      // 각 구간을 순서대로 실제 경로로 업데이트 (구간 완료 시 즉시 화면 갱신)
      for (let i = 0; i < places.length - 1; i++) {
        if (thisRequest.cancelled) return;

        const from = places[i];
        const to   = places[i + 1];
        const transport = to.transport || 'bus';
        const style   = TRANSPORT_STYLES[transport] || TRANSPORT_STYLES.bus;
        const costing = VALHALLA_COSTING_MAP[transport];

        let positions           = [[from.lat, from.lng], [to.lat, to.lng]];
        let isRealRoute         = false;
        let segTime             = null;
        let segDistance         = null;
        let transitDetail       = null;
        let longDistance        = false;
        let longDistanceFallback = false;  // 200km+ 자전거/도보 Haversine 폴백 여부
        let streetNames         = null;
        let hasToll             = false;
        let trainInfo           = null;

        if (costing) {
          // Valhalla 도로 기반 라우팅 (자전거/도보 200km+ 시 분할 라우팅 또는 Haversine 폴백)
          const routeResult = await fetchRoute(from.lat, from.lng, to.lat, to.lng, costing);
          if (routeResult?.coords) {
            positions   = routeResult.coords;
            isRealRoute = positions.length > 2;
          }
          segTime              = routeResult?.time              ?? null;
          segDistance          = routeResult?.distance          ?? null;
          streetNames          = routeResult?.streetNames       ?? null;
          hasToll              = routeResult?.hasToll           ?? false;
          longDistanceFallback = routeResult?.longDistanceFallback ?? false;
        } else if (transport === 'bus' || transport === 'subway') {
          // ODsay 대중교통 (캐시 히트면 위 초기화 단계에서 이미 반영됨 — 재확인만)
          const transitResult = await fetchTransitRoute(from.lat, from.lng, to.lat, to.lng);
          if (transitResult?.coords) {
            positions   = transitResult.coords;
            isRealRoute = positions.length > 2;
          }
          if (transitResult?.info) {
            const t = transitResult.info.totalTime;
            const d = transitResult.info.totalDistance;
            segTime     = (t != null && t > 0) ? t * 60 : null;
            segDistance = (d != null && d > 0) ? d / 1000 : null;
          }
          transitDetail = transitResult?.transitDetail || null;
          longDistance  = transitResult?.longDistance || false;
        } else if (transport === 'train') {
          // 코레일 역 탐색: 출발/도착 좌표 → 가장 가까운 역 → 역 간 폴리라인
          const trainResult = await fetchTrainRoute(from.lat, from.lng, to.lat, to.lng);
          if (trainResult) {
            const { deptStation, arrStation, distKm, estimatedMinutes } = trainResult;
            // 역 좌표로 폴리라인 갱신 (장소 좌표 → 역 좌표)
            positions   = [[deptStation.lat, deptStation.lng], [arrStation.lat, arrStation.lng]];
            segDistance = distKm;
            segTime     = estimatedMinutes * 60; // 초 단위
            trainInfo   = trainResult;
          }
        }
        // ship, plane → 직선 유지

        if (thisRequest.cancelled) return;

        // 이 구간만 즉시 업데이트 (다른 구간은 유지)
        segments[i] = {
          positions, style, transport,
          from: from.name, to: to.name,
          isRoadRoute: isRealRoute,
          time: segTime, distance: segDistance,
          transitDetail, streetNames, hasToll, longDistance, longDistanceFallback, trainInfo,
          loading: false,
        };

        setRouteSegments([...segments]);
        if (onRouteUpdate) {
          const totalTime     = segments.reduce((s, seg) => s + (seg.time || 0), 0);
          const totalDistance = segments.reduce((s, seg) => s + (seg.distance || 0), 0);
          onRouteUpdate({ totalTime, totalDistance, segments: [...segments] });
        }
      }
    };

    buildSegments().then(() => {
      // 수동 새로고침(handleClearCache) 완료 시 스피닝 해제
      if (refreshingRef.current) {
        refreshingRef.current = false;
        setIsRefreshing(false);
      }
    });
  }, [places, refreshKey]);

  // VMS 전광판 이벤트 (자동차/바이크 구간 있을 때만)
  useEffect(() => {
    setRoadEvents([]);
    fetchRoadEvents(places).then(setRoadEvents);
  }, [places]);

  // 시간 포맷 (초 → 시간/분)
  const fmtTime = (secs) => {
    if (secs == null) return null;
    if (secs >= 3600) return `${Math.floor(secs / 3600)}시간 ${Math.round((secs % 3600) / 60)}분`;
    return `${Math.round(secs / 60)}분`;
  };

  return (
    <div className="w-full h-full relative" ref={mapContainerRef}>
      <MapContainer
        center={[37.5665, 126.978]}
        zoom={12}
        style={{ width: '100%', height: '100%' }}
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds places={places} />
        <FlyTo place={focusedPlace} />

        {/* 경로선 */}
        {routeSegments.map((seg, i) => {
          const isSelected = selectedSegmentIndex === i;
          return (
            <Polyline
              key={`route-${i}-${seg.positions.length}`}
              positions={seg.positions}
              pathOptions={{
                color:     seg.style.color,
                weight:    isSelected ? seg.style.weight + 3 : seg.style.weight,
                opacity:   isSelected ? 1.0 : 0.75,
                dashArray: seg.style.dashArray,
                lineCap:   'round',
                lineJoin:  'round',
              }}
              eventHandlers={{
                click: () => onSegmentClick && onSegmentClick(i),
              }}
            />
          );
        })}

        {/* VMS 전광판 경고 마커 (자동차/바이크 구간) */}
        {roadEvents.map((event, i) => (
          <Marker
            key={`vms-${i}`}
            position={[event.lat, event.lng]}
            icon={createVmsIcon(event.roadGrad)}
          >
            <Popup>
              <div style={{ fontSize: '12px', maxWidth: '210px', lineHeight: '1.6' }}>
                <div style={{ fontWeight: 700, marginBottom: 3 }}>
                  {event.roadName
                    ? `${event.roadName}${event.roadGrad === '101' ? ' (고속도로)' : event.roadGrad === '103' ? ' (국도)' : ''}`
                    : event.routeNo ? `국도 ${event.routeNo}호선` : '도로 정보'}
                </div>
                <div>{event.message}</div>
                {event.updatedAt && (
                  <div style={{ color: '#9ca3af', fontSize: 10, marginTop: 4 }}>
                    {fmtVmsTime(event.updatedAt)}
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* 장소 마커 */}
        {places.map((place, index) => {
          const style = TRANSPORT_STYLES[place.transport] || TRANSPORT_STYLES.bus;
          return (
            <Marker
              key={place._id || place.id || `marker-${index}`}
              position={[place.lat, place.lng]}
              icon={createNumberedIcon(place.order, place.checked)}
            >
              <Popup>
                <div className="text-sm">
                  <strong>{place.order}. {place.name}</strong><br />
                  <span className="text-gray-500">{place.address}</span>
                  {place.transport && (
                    <><br /><span style={{ color: style.color }}>{style.pattern} {style.label}으로 이동</span></>
                  )}
                  {place.reservation && (
                    <><br /><span style={{ color: '#d97706' }}>🎫 {place.reservation}</span></>
                  )}
                  {place.note && (
                    <><br /><span className="text-gray-400">📝 {place.note}</span></>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* 경로 새로고침 버튼 (캐시 초기화 + 재계산) */}
      {places.length >= 2 && (
        <button
          onClick={handleClearCache}
          disabled={isRefreshing}
          className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-sm rounded-lg px-2.5 py-1.5 shadow-md z-[1000] text-xs font-medium text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
          title="경로 캐시를 초기화하고 다시 계산합니다"
        >
          <span className={`inline-block text-base leading-none ${isRefreshing ? 'animate-spin' : ''}`}>
            ↺
          </span>
          <span>{isRefreshing ? '계산 중…' : '경로 새로고침'}</span>
        </button>
      )}

      {/* 범례 토글 버튼 + 패널 (subway·taxi 중복 제거) */}
      {places.length >= 2 && (
        <div className="absolute bottom-4 left-4 z-[1000]">
          <button
            onClick={() => setLegendOpen(v => !v)}
            className="flex items-center gap-1.5 bg-white/90 backdrop-blur-sm rounded-lg px-2.5 py-1.5 shadow-md text-xs font-medium text-gray-600 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          >
            <span>이동수단</span>
            <span className="text-gray-400">{legendOpen ? '▲' : '▼'}</span>
          </button>
          {legendOpen && (
            <div className="mt-1 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-md text-xs">
              {Object.entries(TRANSPORT_STYLES)
                .filter(([key]) => !['subway', 'taxi'].includes(key))
                .map(([key, style]) => (
                  <div key={key} className="flex items-center gap-2 py-0.5">
                    <svg width="28" height="6" className="flex-shrink-0">
                      <line x1="0" y1="3" x2="28" y2="3"
                        stroke={style.color}
                        strokeWidth={style.weight > 5 ? 3 : style.weight > 3 ? 2.5 : 2}
                        strokeDasharray={style.dashArray ? style.dashArray.split(',').map(v => parseFloat(v) * 0.6).join(',') : undefined}
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="text-gray-600">{style.label}</span>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Map;
