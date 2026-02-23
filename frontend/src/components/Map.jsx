import { useEffect, useMemo, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// 이동수단별 스타일 (색상 + 선 패턴 + 두께)
const TRANSPORT_STYLES = {
  walk:       { color: '#10b981', dashArray: '4, 8',          weight: 4, label: '도보',    pattern: '· · · ·' },
  bicycle:    { color: '#34d399', dashArray: '10, 6',         weight: 4, label: '자전거',  pattern: '- - - -' },
  motorcycle: { color: '#a855f7', dashArray: '14, 6, 4, 6',  weight: 4, label: '바이크',  pattern: '─ · ─ ·' },
  bus:        { color: '#3b82f6', dashArray: undefined,       weight: 6, label: '버스',    pattern: '━━━━' },
  subway:     { color: '#6366f1', dashArray: '16, 8',         weight: 6, label: '지하철',  pattern: '━ ━ ━' },
  train:      { color: '#8b5cf6', dashArray: '24, 8',         weight: 6, label: '기차',    pattern: '━━ ━━' },
  car:        { color: '#f97316', dashArray: undefined,       weight: 5, label: '자차',    pattern: '━━━━' },
  taxi:       { color: '#eab308', dashArray: undefined,       weight: 3, label: '택시',    pattern: '───' },
  ship:       { color: '#06b6d4', dashArray: '6, 6',          weight: 5, label: '배',      pattern: '~ ~ ~' },
  plane:      { color: '#ec4899', dashArray: '20, 14',        weight: 4, label: '비행기',  pattern: '── ──' },
};

// 교통수단 → Valhalla costing 매핑
// null = 직선 또는 별도 API 사용
const VALHALLA_COSTING_MAP = {
  walk:       'pedestrian',   // 보도 우선, 자동차전용도로 진입 불가
  bicycle:    'bicycle',      // 자전거도로 우선, 고속도로/자동차전용도로 진입 불가
  motorcycle: 'motor_scooter',// 이륜차 경로, 자동차전용도로 자동 회피
  bus:        null,           // ODsay 대중교통 API 사용
  subway:     null,           // ODsay 대중교통 API 사용
  train:      null,           // 고정 철도 노선 → 직선
  car:        'auto',         // 일반 차량 최적 경로
  taxi:       'auto',         // 일반 차량 최적 경로
  ship:       null,           // 해상 경로 → 직선
  plane:      null,           // 항공 경로 → 직선
};

// ODsay API로 대중교통 경로를 가져오는 함수
// bus/subway 교통수단에 사용 (mode: 'bus'=버스우선, 'subway'=지하철우선)
const transitCache = {};

const fetchTransitRoute = async (fromLat, fromLng, toLat, toLng, mode = 'bus') => {
  const cacheKey = `transit-${mode}-${fromLat},${fromLng}-${toLat},${toLng}`;
  if (transitCache[cacheKey] !== undefined) return transitCache[cacheKey];

  try {
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';
    // ODsay는 경도(X), 위도(Y) 순서
    const url = `${apiBase}/transit/route?sx=${fromLng}&sy=${fromLat}&ex=${toLng}&ey=${toLat}&mode=${mode}`;
    const response = await fetch(url);

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    const result = data.coords
      ? { coords: data.coords, info: data.info, transitDetail: data.transitDetail }
      : null;
    transitCache[cacheKey] = result;
    return result;
  } catch (error) {
    console.warn('ODsay 경로 요청 실패:', error.message);
    transitCache[cacheKey] = null;
    return null;
  }
};

// Valhalla polyline6 디코딩 (precision=6)
// Valhalla는 GeoJSON 대신 인코딩된 polyline으로 shape를 반환한다
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
    coords.push([lat / inv, lng / inv]); // Leaflet [lat, lng]
  }
  return coords;
};

// 경로 캐시 (세션 동안 유지)
const routeCache = {};

// Valhalla maneuvers에서 주요 도로명 추출 (바이크 경로용)
// "street_names":["도로명1","도로명2"] 패턴을 찾아 유니크하게 수집
const extractStreetNames = (raw) => {
  const names = [];
  const regex = /"street_names":\[([^\]]*)\]/g;
  let match;
  while ((match = regex.exec(raw)) !== null) {
    const inner = match[1];
    // 문자열 배열 파싱: ["name1","name2"]
    const items = inner.match(/"([^"]+)"/g);
    if (items) {
      items.forEach(item => {
        const name = item.replace(/"/g, '').trim();
        if (name && !names.includes(name)) names.push(name);
      });
    }
  }
  // 중복·너무 많으면 상위 5개만
  return names.slice(0, 5);
};

// Valhalla 공개 서버에서 교통수단별 실제 도로 경로를 가져오는 함수
// 반환: { coords, time, distance, streetNames? } 또는 null
const fetchRoute = async (fromLat, fromLng, toLat, toLng, costing) => {
  const cacheKey = `${fromLat},${fromLng}-${toLat},${toLng}-${costing}`;
  if (routeCache[cacheKey]) return routeCache[cacheKey];

  try {
    const body = JSON.stringify({
      locations: [
        { lat: fromLat, lon: fromLng },
        { lat: toLat,   lon: toLng   },
      ],
      costing,
      directions_options: { units: 'km' },
    });

    const response = await fetch('https://valhalla1.openstreetmap.de/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    const raw = await response.text();

    // 한글 도로명의 이스케이프 문자로 인해 JSON.parse()가 실패할 수 있어
    // shape 필드만 regex로 추출 후 나머지를 파싱한다
    const shapeMatch = raw.match(/"shape":"([^"]+)"/);
    if (!shapeMatch) return null;

    const coords = decodePolyline6(shapeMatch[1].replace(/\\\\/g, '\\'));
    if (coords.length < 2) return null;

    // 소요시간(초)과 거리(km) 추출
    const timeMatch = raw.match(/"time":(\d+(?:\.\d+)?)/);
    const lengthMatch = raw.match(/"length":(\d+(?:\.\d+)?)/);
    const time = timeMatch ? parseFloat(timeMatch[1]) : null;
    const distance = lengthMatch ? parseFloat(lengthMatch[1]) : null;

    // 바이크(motor_scooter)인 경우 주요 도로명 추출
    const streetNames = costing === 'motor_scooter' ? extractStreetNames(raw) : null;

    const result = { coords, time, distance, streetNames };
    routeCache[cacheKey] = result;
    return result;
  } catch (error) {
    console.warn('Valhalla 경로 요청 실패:', error);
  }

  return null; // 실패 시 null → 직선 폴백
};

// 순서 번호가 표시되는 커스텀 마커 생성
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

// 지도 범위 자동 조정 컴포넌트
const FitBounds = ({ places }) => {
  const map = useMap();

  useEffect(() => {
    if (places.length === 0) {
      map.setView([37.5665, 126.978], 12);
      return;
    }

    if (places.length === 1) {
      map.setView([places[0].lat, places[0].lng], 14);
      return;
    }

    const bounds = L.latLngBounds(places.map(p => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [50, 50] });
  }, [places, map]);

  return null;
};

const Map = ({ places, onRouteUpdate, mapContainerRef }) => {
  const [routeSegments, setRouteSegments] = useState([]);
  const abortRef = useRef(null);

  // places가 바뀔 때마다 경로 계산
  useEffect(() => {
    // 이전 요청 취소 플래그
    if (abortRef.current) abortRef.current.cancelled = true;
    const thisRequest = { cancelled: false };
    abortRef.current = thisRequest;

    if (places.length < 2) {
      setRouteSegments([]);
      return;
    }

    const buildSegments = async () => {
      const segments = [];

      for (let i = 0; i < places.length - 1; i++) {
        if (thisRequest.cancelled) return;

        const from = places[i];
        const to = places[i + 1];
        const transport = to.transport || 'bus';
        const style = TRANSPORT_STYLES[transport] || TRANSPORT_STYLES.bus;
        const costing = VALHALLA_COSTING_MAP[transport];

        let positions;
        let isRealRoute = false;
        let segTime = null;
        let segDistance = null;
        let transitDetail = null;
        let streetNames = null;

        if (costing) {
          // 도로 기반 교통수단 → Valhalla에서 교통수단별 실제 경로 가져오기
          const routeResult = await fetchRoute(from.lat, from.lng, to.lat, to.lng, costing);
          positions = routeResult?.coords || [[from.lat, from.lng], [to.lat, to.lng]];
          isRealRoute = !!(routeResult?.coords && routeResult.coords.length > 2);
          segTime = routeResult?.time ?? null;
          segDistance = routeResult?.distance ?? null;
          streetNames = routeResult?.streetNames ?? null; // 바이크 전용
        } else if (transport === 'bus' || transport === 'subway') {
          // 대중교통 → ODsay API로 실제 노선 경로 가져오기
          // bus: SearchPathType=2(버스우선), subway: SearchPathType=1(지하철우선)
          const transitResult = await fetchTransitRoute(from.lat, from.lng, to.lat, to.lng, transport);
          const transitCoords = transitResult?.coords || null;
          positions = transitCoords || [[from.lat, from.lng], [to.lat, to.lng]];
          isRealRoute = !!(transitCoords && transitCoords.length > 2);
          // ODsay가 반환한 소요시간(분→초), 거리(m→km) 반영
          if (transitResult?.info) {
            segTime = transitResult.info.totalTime ? transitResult.info.totalTime * 60 : null;
            segDistance = transitResult.info.totalDistance ? transitResult.info.totalDistance / 1000 : null;
          }
          // 환승 상세 정보
          transitDetail = transitResult?.transitDetail || null;
        } else {
          // 기차, 배, 비행기 → 직선
          positions = [[from.lat, from.lng], [to.lat, to.lng]];
        }

        segments.push({
          positions,
          style,
          transport,
          from: from.name,
          to: to.name,
          isRoadRoute: isRealRoute,
          time: segTime,
          distance: segDistance,
          transitDetail, // 대중교통 환승 상세 (버스번호, 호선, 승하차 정류장)
          streetNames,   // 바이크 주요 도로명 목록
        });
      }

      if (!thisRequest.cancelled) {
        setRouteSegments(segments);
        // 전체 소요시간/거리 합계 + 세그먼트 목록을 부모에게 전달
        if (onRouteUpdate) {
          const totalTime = segments.reduce((sum, s) => sum + (s.time || 0), 0);
          const totalDistance = segments.reduce((sum, s) => sum + (s.distance || 0), 0);
          onRouteUpdate({ totalTime, totalDistance, segments });
        }
      }
    };

    // 즉시 직선으로 표시 후, 비동기로 도로 경로 업데이트
    const quickSegments = [];
    for (let i = 0; i < places.length - 1; i++) {
      const from = places[i];
      const to = places[i + 1];
      const transport = to.transport || 'bus';
      const style = TRANSPORT_STYLES[transport] || TRANSPORT_STYLES.bus;
      quickSegments.push({
        positions: [[from.lat, from.lng], [to.lat, to.lng]],
        style,
        transport,
        from: from.name,
        to: to.name,
        isRoadRoute: false,
      });
    }
    setRouteSegments(quickSegments);

    // 비동기로 실제 도로 경로 가져오기
    buildSegments();
  }, [places]);

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

        {/* 경로선 (이동수단별 색상 + 패턴, 도로 기반 라우팅) */}
        {routeSegments.map((seg, i) => (
          <Polyline
            key={`route-${i}-${seg.positions.length}`}
            positions={seg.positions}
            pathOptions={{
              color: seg.style.color,
              weight: seg.style.weight,
              opacity: 0.85,
              dashArray: seg.style.dashArray,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          >
            <Popup minWidth={200}>
              <div style={{ fontSize: '13px', lineHeight: '1.6', maxWidth: '260px' }}>
                {/* 출발 → 도착 헤더 */}
                <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                  {seg.from} → {seg.to}
                </div>
                {/* 이동수단 + 거리 + 시간 요약 */}
                <div style={{ color: seg.style.color, marginBottom: '4px' }}>
                  {seg.style.label}
                  {seg.distance != null && (
                    <span style={{ color: '#6b7280' }}> · {seg.distance.toFixed(1)}km</span>
                  )}
                  {seg.time != null && (
                    <span style={{ color: '#6b7280' }}>
                      {' · '}
                      {seg.time >= 3600
                        ? `${Math.floor(seg.time / 3600)}시간 ${Math.round((seg.time % 3600) / 60)}분`
                        : `${Math.round(seg.time / 60)}분`}
                    </span>
                  )}
                </div>
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
                {/* 대중교통 환승 상세 */}
                {seg.transitDetail && seg.transitDetail.length > 0 && (
                  <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '6px', marginTop: '4px' }}>
                    {seg.transitDetail.map((d, di) => {
                      if (d.type === 'walk') {
                        return (
                          <div key={di} style={{ color: '#9ca3af', fontSize: '11px', margin: '3px 0' }}>
                            🚶 도보
                            {d.sectionTime ? ` ${d.sectionTime}분` : ''}
                            {d.distance ? ` (${d.distance}m)` : ''}
                          </div>
                        );
                      }
                      const icon = d.type === 'bus' ? '🚌' : '🚇';
                      const lineColor = d.type === 'bus' ? '#3b82f6' : '#6366f1';
                      return (
                        <div key={di} style={{ margin: '4px 0' }}>
                          {/* 노선명 뱃지 */}
                          <div style={{ marginBottom: '2px' }}>
                            {d.lines.map((line, li) => (
                              <span key={li} style={{
                                display: 'inline-block',
                                background: lineColor,
                                color: 'white',
                                fontSize: '11px',
                                fontWeight: 'bold',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                marginRight: '3px',
                              }}>
                                {icon} {line}
                              </span>
                            ))}
                            {d.sectionTime && (
                              <span style={{ fontSize: '11px', color: '#9ca3af' }}>{d.sectionTime}분</span>
                            )}
                          </div>
                          {/* 승차 → 하차 */}
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
                  <strong>{place.order}. {place.name}</strong>
                  <br />
                  <span className="text-gray-500">{place.address}</span>
                  {place.transport && (
                    <>
                      <br />
                      <span style={{ color: style.color }}>
                        {style.pattern} {style.label}으로 이동
                      </span>
                    </>
                  )}
                  {place.reservation && (
                    <>
                      <br />
                      <span style={{ color: '#d97706' }}>🎫 {place.reservation}</span>
                    </>
                  )}
                  {place.note && (
                    <>
                      <br />
                      <span className="text-gray-400">📝 {place.note}</span>
                    </>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* 범례 - 패턴 미리보기 포함 */}
      {places.length >= 2 && (
        <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-md z-[1000] text-xs">
          <div className="font-semibold text-gray-700 mb-1">이동수단</div>
          {Object.entries(TRANSPORT_STYLES).map(([key, style]) => (
            <div key={key} className="flex items-center gap-2 py-0.5">
              <svg width="28" height="6" className="flex-shrink-0">
                <line
                  x1="0" y1="3" x2="28" y2="3"
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
