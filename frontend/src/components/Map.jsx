import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// 이동수단별 색상
const TRANSPORT_COLORS = {
  walk: '#10b981',       // 초록
  bicycle: '#34d399',    // 에메랄드
  motorcycle: '#a855f7', // 보라
  bus: '#3b82f6',        // 파랑
  subway: '#6366f1',     // 인디고
  train: '#8b5cf6',      // 바이올렛
  car: '#f97316',        // 주황
  taxi: '#eab308',       // 노랑
  ship: '#06b6d4',       // 시안
  plane: '#ec4899',      // 핑크
};

const TRANSPORT_LABELS = {
  walk: '도보',
  bicycle: '자전거',
  motorcycle: '바이크',
  bus: '버스',
  subway: '지하철',
  train: '기차',
  car: '자차',
  taxi: '택시',
  ship: '배',
  plane: '비행기',
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
  // 경로선 세그먼트 생성 (장소 사이마다 이동수단 색상 적용)
  const routeSegments = useMemo(() => {
    if (places.length < 2) return [];

    const segments = [];
    for (let i = 0; i < places.length - 1; i++) {
      const from = places[i];
      const to = places[i + 1];
      const transport = to.transport || 'bus';

      segments.push({
        positions: [[from.lat, from.lng], [to.lat, to.lng]],
        color: TRANSPORT_COLORS[transport] || TRANSPORT_COLORS.bus,
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

        {/* 경로선 (이동수단별 색상) */}
        {routeSegments.map((seg, i) => (
          <Polyline
            key={`route-${i}`}
            positions={seg.positions}
            pathOptions={{
              color: seg.color,
              weight: 5,
              opacity: 0.8,
              dashArray: ['walk', 'bicycle'].includes(seg.transport) ? '10, 10' : undefined,
            }}
          >
            <Popup>
              <div className="text-sm">
                <strong>{seg.from}</strong> → <strong>{seg.to}</strong>
                <br />
                <span style={{ color: seg.color }}>● {TRANSPORT_LABELS[seg.transport]}</span>
              </div>
            </Popup>
          </Polyline>
        ))}

        {/* 마커 */}
        {places.map((place, index) => (
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
                    <span style={{ color: TRANSPORT_COLORS[place.transport] }}>
                      ● {TRANSPORT_LABELS[place.transport]}으로 이동
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
        ))}
      </MapContainer>

      {/* 범례 */}
      {places.length >= 2 && (
        <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-md z-[1000] text-xs">
          <div className="font-semibold text-gray-700 mb-1">이동수단</div>
          {Object.entries(TRANSPORT_LABELS).map(([key, label]) => (
            <div key={key} className="flex items-center gap-1.5">
              <span
                className="inline-block w-4 h-0.5 rounded"
                style={{
                  backgroundColor: TRANSPORT_COLORS[key],
                  borderBottom: key === 'walk' ? `2px dashed ${TRANSPORT_COLORS[key]}` : `2px solid ${TRANSPORT_COLORS[key]}`,
                }}
              />
              <span className="text-gray-600">{label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Map;
