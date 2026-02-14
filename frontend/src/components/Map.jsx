import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// 이동수단별 스타일 (색상 + 선 패턴 + 두께)
// dashArray: SVG dash 패턴 (선길이, 간격, ...)
// 색각 이상자도 패턴만으로 구분 가능하도록 설계
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

const Map = ({ places }) => {
  // 경로선 세그먼트 생성 (장소 사이마다 이동수단 스타일 적용)
  const routeSegments = useMemo(() => {
    if (places.length < 2) return [];

    const segments = [];
    for (let i = 0; i < places.length - 1; i++) {
      const from = places[i];
      const to = places[i + 1];
      const transport = to.transport || 'bus';
      const style = TRANSPORT_STYLES[transport] || TRANSPORT_STYLES.bus;

      segments.push({
        positions: [[from.lat, from.lng], [to.lat, to.lng]],
        style,
        transport,
        from: from.name,
        to: to.name,
      });
    }
    return segments;
  }, [places]);

  return (
    <div className="w-full h-full relative">
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

        {/* 경로선 (이동수단별 색상 + 패턴) */}
        {routeSegments.map((seg, i) => (
          <Polyline
            key={`route-${i}`}
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
            <Popup>
              <div className="text-sm">
                <strong>{seg.from}</strong> → <strong>{seg.to}</strong>
                <br />
                <span style={{ color: seg.style.color }}>
                  {seg.style.pattern} {seg.style.label}
                </span>
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
