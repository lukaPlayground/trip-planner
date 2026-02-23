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
const Map = ({ places, onRouteUpdate, mapContainerRef }) => {
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
      const segments = [];

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

        if (costing) {
          // Valhalla 도로 기반 라우팅
          const routeResult = await fetchRoute(from.lat, from.lng, to.lat, to.lng, costing);
          if (routeResult?.coords) {
            positions   = routeResult.coords;
            isRealRoute = positions.length > 2;
          }
          // ── 핵심 수정: summary 레벨 time(초)/distance(km) 사용 ──
          segTime     = routeResult?.time     ?? null;  // 초
          segDistance = routeResult?.distance ?? null;  // km
          streetNames = routeResult?.streetNames ?? null;
          hasToll     = routeResult?.hasToll ?? false;
        } else if (transport === 'bus' || transport === 'subway') {
          // ODsay 대중교통
          const transitResult = await fetchTransitRoute(from.lat, from.lng, to.lat, to.lng);
          if (transitResult?.coords) {
            positions   = transitResult.coords;
            isRealRoute = positions.length > 2;
          }
          if (transitResult?.info) {
            const t = transitResult.info.totalTime;
            const d = transitResult.info.totalDistance;
            segTime     = (t != null && t > 0) ? t * 60 : null;   // 분 → 초
            segDistance = (d != null && d > 0) ? d / 1000 : null; // m  → km
          }
          transitDetail = transitResult?.transitDetail || null;
          longDistance  = transitResult?.longDistance || false;
        }
        // train, ship, plane → 직선 유지

        segments.push({
          positions,
          style,
          transport,
          from: from.name,
          to:   to.name,
          isRoadRoute: isRealRoute,
          time:         segTime,
          distance:     segDistance,
          transitDetail,
          streetNames,
          hasToll,
          longDistance,
        });
      }

      if (!thisRequest.cancelled) {
        setRouteSegments(segments);
        if (onRouteUpdate) {
          const totalTime     = segments.reduce((s, seg) => s + (seg.time || 0), 0);
          const totalDistance = segments.reduce((s, seg) => s + (seg.distance || 0), 0);
          onRouteUpdate({ totalTime, totalDistance, segments });
        }
      }
    };

    // 즉시 직선 표시
    const quickSegments = places.slice(0, -1).map((from, i) => {
      const to = places[i + 1];
      const transport = to.transport || 'bus';
      return {
        positions: [[from.lat, from.lng], [to.lat, to.lng]],
        style: TRANSPORT_STYLES[transport] || TRANSPORT_STYLES.bus,
        transport, from: from.name, to: to.name, isRoadRoute: false,
      };
    });
    setRouteSegments(quickSegments);

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
        {routeSegments.map((seg, i) => (
          <Polyline
            key={`route-${i}-${seg.positions.length}`}
            positions={seg.positions}
            pathOptions={{
              color:     seg.style.color,
              weight:    seg.style.weight,
              opacity:   0.85,
              dashArray: seg.style.dashArray,
              lineCap:   'round',
              lineJoin:  'round',
            }}
          >
            <Popup minWidth={200}>
              <div style={{ fontSize: '13px', lineHeight: '1.6', maxWidth: '260px' }}>
                {/* 출발 → 도착 */}
                <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                  {seg.from} → {seg.to}
                </div>
                {/* 이동수단 + 거리 + 시간 */}
                <div style={{ color: seg.style.color, marginBottom: '4px' }}>
                  {seg.style.label}
                  {seg.distance != null && (
                    <span style={{ color: '#6b7280' }}> · {seg.distance.toFixed(1)}km</span>
                  )}
                  {seg.time != null && (
                    <span style={{ color: '#6b7280' }}> · {fmtTime(seg.time)}</span>
                  )}
                </div>
                {/* 유료도로 안내 (자동차) */}
                {seg.hasToll && (
                  <div style={{ color: '#d97706', fontSize: '11px', marginBottom: '4px' }}>
                    🛣️ 유료도로 포함 구간
                  </div>
                )}
                {/* 바이크 주요 경유 도로 */}
                {seg.streetNames && seg.streetNames.length > 0 && (
                  <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '6px', marginTop: '4px' }}>
                    <div style={{ fontSize: '11px', color: '#7c3aed', fontWeight: 'bold', marginBottom: '3px' }}>
                      🛵 주요 경유 도로
                    </div>
                    {seg.streetNames.map((name, ni) => (
                      <div key={ni} style={{ fontSize: '11px', color: '#374151', padding: '1px 0' }}>
                        · {name}
                      </div>
                    ))}
                  </div>
                )}
                {/* 광역 구간 기차 이용 안내 (ODsay 경로 없음 + 50km 이상) */}
                {seg.longDistance && (!seg.transitDetail || seg.transitDetail.length === 0) && (
                  <div style={{
                    borderTop: '1px solid #e5e7eb', paddingTop: '6px', marginTop: '4px',
                    background: '#fef3c7', borderRadius: '6px', padding: '8px 10px',
                  }}>
                    <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#92400e', marginBottom: '3px' }}>
                      🚆 장거리 구간 안내
                    </div>
                    <div style={{ fontSize: '11px', color: '#78350f', lineHeight: '1.5' }}>
                      이 구간은 버스·지하철 직통 경로가 없습니다.<br/>
                      <strong>KTX·SRT·무궁화 등 기차 이용</strong>을 추천합니다.<br/>
                      이동수단을 <strong>'기차'</strong>로 변경하면 예약번호를 저장할 수 있습니다.
                    </div>
                  </div>
                )}
                {/* 대중교통 환승 상세 */}
                {seg.transitDetail && seg.transitDetail.length > 0 && (
                  <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '6px', marginTop: '4px' }}>
                    {seg.transitDetail.map((d, di) => {
                      if (d.type === 'walk') {
                        return (
                          <div key={di} style={{ color: '#9ca3af', fontSize: '11px', margin: '3px 0' }}>
                            🚶 도보{d.sectionTime ? ` ${d.sectionTime}분` : ''}{d.distance ? ` (${d.distance}m)` : ''}
                          </div>
                        );
                      }
                      const icon = d.type === 'bus' ? '🚌' : '🚇';
                      const lineColor = d.type === 'bus' ? '#3b82f6' : '#6366f1';
                      return (
                        <div key={di} style={{ margin: '4px 0' }}>
                          <div style={{ marginBottom: '2px' }}>
                            {d.lines.map((line, li) => (
                              <span key={li} style={{
                                display: 'inline-block', background: lineColor, color: 'white',
                                fontSize: '11px', fontWeight: 'bold', padding: '1px 6px',
                                borderRadius: '4px', marginRight: '3px',
                              }}>
                                {icon} {line}
                              </span>
                            ))}
                            {d.sectionTime && (
                              <span style={{ fontSize: '11px', color: '#9ca3af' }}>{d.sectionTime}분</span>
                            )}
                          </div>
                          {d.boardStation && (
                            <div style={{ fontSize: '11px', color: '#374151' }}>
                              <span style={{ color: '#10b981', fontWeight: 'bold' }}>승차</span> {d.boardStation}
                              {d.stationCount > 2 && (
                                <span style={{ color: '#9ca3af' }}> → ({d.stationCount - 2}개 정류장) → </span>
                              )}
                              {d.alightStation && d.alightStation !== d.boardStation && (
                                <> <span style={{ color: '#ef4444', fontWeight: 'bold' }}>하차</span> {d.alightStation}</>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Popup>
          </Polyline>
        ))}

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
