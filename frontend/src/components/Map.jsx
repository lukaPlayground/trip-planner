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

// Valhalla 경로 요청
// 핵심 수정: summary 레벨의 time/length를 추출해야 함
// "summary":{"has_toll":true,...,"time":7752,"length":132.04,...}
// → 기존 regex는 maneuver 레벨 첫 번째 "time" 값을 잡아서 2분으로 오출력됨
const fetchRoute = async (fromLat, fromLng, toLat, toLng, costing, useTolls = true) => {
  const cacheKey = `${fromLat},${fromLng}-${toLat},${toLng}-${costing}-${useTolls}`;
  if (routeCache[cacheKey]) return routeCache[cacheKey];

  try {
    const costingOptions = {};
    if (costing === 'auto') {
      // 유료도로 사용 여부 제어
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
    // summary 블록을 먼저 추출한 뒤 그 안에서 파싱
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

    const result = { coords, time, distance, streetNames, hasToll };
    routeCache[cacheKey] = result;
    return result;
  } catch (error) {
    console.warn('Valhalla 경로 요청 실패:', error);
  }

  return null;
};

// ── 커스텀 마커 ──
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

// ── Map 컴포넌트 ──
const Map = ({ places, onRouteUpdate, mapContainerRef, onSegmentClick, selectedSegmentIndex }) => {
  const [routeSegments, setRouteSegments] = useState([]);
  const abortRef = useRef(null);

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
          };
        }

        // 캐시 없음 → 직선 placeholder
        return {
          positions: [[from.lat, from.lng], [to.lat, to.lng]],
          style, transport, from: from.name, to: to.name,
          isRoadRoute: false, time: null, distance: null,
          transitDetail: null, longDistance: false, streetNames: null, hasToll: false, trainInfo: null,
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

        let positions   = [[from.lat, from.lng], [to.lat, to.lng]];
        let isRealRoute = false;
        let segTime       = null;
        let segDistance   = null;
        let transitDetail = null;
        let longDistance  = false;
        let streetNames   = null;
        let hasToll       = false;
        let trainInfo     = null;

        if (costing) {
          // Valhalla 도로 기반 라우팅
          const routeResult = await fetchRoute(from.lat, from.lng, to.lat, to.lng, costing);
          if (routeResult?.coords) {
            positions   = routeResult.coords;
            isRealRoute = positions.length > 2;
          }
          segTime     = routeResult?.time     ?? null;
          segDistance = routeResult?.distance ?? null;
          streetNames = routeResult?.streetNames ?? null;
          hasToll     = routeResult?.hasToll ?? false;
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
          transitDetail, streetNames, hasToll, longDistance, trainInfo,
        };

        setRouteSegments([...segments]);
        if (onRouteUpdate) {
          const totalTime     = segments.reduce((s, seg) => s + (seg.time || 0), 0);
          const totalDistance = segments.reduce((s, seg) => s + (seg.distance || 0), 0);
          onRouteUpdate({ totalTime, totalDistance, segments: [...segments] });
        }
      }
    };

    buildSegments();
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

        {/* 마커 */}
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

      {/* 범례 (subway·taxi 중복 제거) */}
      {places.length >= 2 && (
        <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-md z-[1000] text-xs">
          <div className="font-semibold text-gray-700 mb-1">이동수단</div>
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
  );
};

export default Map;
