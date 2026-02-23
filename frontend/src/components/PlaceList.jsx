import { useRef, useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { FaGripVertical, FaTrash, FaCheck, FaWalking, FaBicycle, FaMotorcycle, FaBus, FaSubway, FaTrain, FaCar, FaShip, FaPlane, FaTicketAlt, FaChevronRight, FaChevronDown, FaExchangeAlt, FaRoad } from 'react-icons/fa';

// bus/subway → 대중교통(transit)으로 통합: 내부 값 'bus' 유지 (Map.jsx 호환)
// car/taxi → 자동차로 통합: 내부 값 'car' 유지, taxi 레거시 데이터는 car로 폴백
const TRANSPORT_OPTIONS = [
  { value: 'walk',       icon: FaWalking,    label: '도보',    color: '#10b981', reservable: false },
  { value: 'bicycle',    icon: FaBicycle,    label: '자전거',  color: '#34d399', reservable: false },
  { value: 'motorcycle', icon: FaMotorcycle, label: '바이크',  color: '#a855f7', reservable: false },
  { value: 'bus',        icon: FaBus,        label: '대중교통', color: '#3b82f6', reservable: false },
  // subway는 UI에서 제거 — bus와 동일 ODsay 경로 사용
  { value: 'train',      icon: FaTrain,      label: '기차',    color: '#8b5cf6', reservable: true, placeholder: '예매번호 (KTX/SRT 등)' },
  { value: 'car',        icon: FaCar,        label: '자동차',  color: '#f97316', reservable: false },
  // taxi는 UI에서 제거 — car와 동일 Valhalla auto 경로 사용 (레거시 데이터 → car 폴백)
  { value: 'ship',       icon: FaShip,       label: '배',      color: '#06b6d4', reservable: true, placeholder: '예매번호 (여객선)' },
  { value: 'plane',      icon: FaPlane,      label: '비행기',  color: '#ec4899', reservable: true, placeholder: '예약번호 (항공편명)' },
];

// 스크롤 가능 여부 감지 훅
const useScrollHint = () => {
  const scrollRef = useRef(null);
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const check = () => {
      setShowHint(el.scrollWidth > el.clientWidth && el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    };
    check();
    el.addEventListener('scroll', check);
    window.addEventListener('resize', check);
    return () => {
      el.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  }, []);

  return { scrollRef, showHint };
};

// 구간 소요시간 포맷 (초 단위)
const formatSegTime = (secs) => {
  if (!secs && secs !== 0) return null;
  if (secs >= 3600) return `${Math.floor(secs / 3600)}시간 ${Math.round((secs % 3600) / 60)}분`;
  return `${Math.round(secs / 60)}분`;
};

// 대중교통 환승 패널 컴포넌트
const TransitDetailPanel = ({ transitDetail }) => {
  if (!transitDetail || transitDetail.length === 0) return null;

  return (
    <div className="mt-1.5 rounded-lg border border-blue-100 bg-blue-50 overflow-hidden">
      {transitDetail.map((d, i) => {
        if (d.type === 'walk') {
          return (
            <div key={i} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 border-t border-blue-100 first:border-t-0">
              <FaWalking size={10} className="flex-shrink-0" />
              <span>도보{d.sectionTime ? ` ${d.sectionTime}분` : ''}{d.distance ? ` (${d.distance}m)` : ''}</span>
            </div>
          );
        }

        const isBus = d.type === 'bus';
        const Icon = isBus ? FaBus : FaSubway;
        const lineColor = isBus ? '#3b82f6' : '#6366f1';
        const bgColor = isBus ? '#eff6ff' : '#eef2ff';

        return (
          <div key={i} className="px-3 py-2 border-t border-blue-100 first:border-t-0" style={{ background: bgColor }}>
            {/* 노선명 배지 + 소요시간 */}
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              {d.lines.map((line, li) => (
                <span key={li} className="inline-flex items-center gap-1 text-white text-xs font-bold px-2 py-0.5 rounded"
                  style={{ background: lineColor }}>
                  <Icon size={9} />
                  {line}
                </span>
              ))}
              {d.sectionTime && (
                <span className="text-xs text-gray-400">{d.sectionTime}분</span>
              )}
              {d.stationCount > 0 && (
                <span className="text-xs text-gray-400">({d.stationCount}정류장)</span>
              )}
            </div>
            {/* 승차 → 하차 정류장 */}
            {d.boardStation && (
              <div className="flex items-center gap-1 text-xs text-gray-600 flex-wrap">
                <span className="font-medium text-green-600">승차</span>
                <span className="truncate max-w-[80px]">{d.boardStation}</span>
                {d.alightStation && d.alightStation !== d.boardStation && (
                  <>
                    <FaChevronRight size={8} className="text-gray-300 flex-shrink-0" />
                    <span className="font-medium text-red-500">하차</span>
                    <span className="truncate max-w-[80px]">{d.alightStation}</span>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// 장소 사이 구간 카드: 이동수단 선택 + 소요시간/거리 + 예약정보 + 환승상세
const SegmentCard = ({
  placeIndex,       // 도착 장소의 인덱스 (= 이 구간의 to 인덱스)
  place,            // 도착 장소 (transport, reservation 필드 보유)
  seg,              // routeSegments[placeIndex - 1]
  onUpdateTransport,
  onUpdateReservation,
}) => {
  const [open, setOpen] = useState(false);
  const { scrollRef, showHint } = useScrollHint();

  // subway/taxi는 UI에서 제거됐지만 기존 저장 데이터 호환:
  //   subway → bus, taxi → car 로 fallback
  const rawTransport = place.transport || 'bus';
  const currentTransport =
    rawTransport === 'subway' ? 'bus' :
    rawTransport === 'taxi'   ? 'car' :
    rawTransport;
  const transportOpt = TRANSPORT_OPTIONS.find(t => t.value === currentTransport);
  const transportColor = transportOpt?.color || '#3b82f6';
  const isReservable = transportOpt?.reservable;

  const segTimeStr = seg?.time != null ? formatSegTime(seg.time) : null;
  const segDistStr = seg?.distance != null ? `${seg.distance.toFixed(1)}km` : null;
  const hasTransitDetail = seg?.transitDetail && seg.transitDetail.length > 0;
  const hasToll = currentTransport === 'car' && seg?.hasToll === true;
  // 광역 대중교통 구간에서 ODsay 경로를 찾지 못한 경우 → 기차 이용 안내
  const showLongDistanceHint =
    currentTransport === 'bus' && seg?.longDistance && !hasTransitDetail;

  return (
    <div className="relative flex items-stretch px-1">
      {/* 세로 연결선 */}
      <div className="flex flex-col items-center mr-2" style={{ width: '28px' }}>
        <div className="w-0.5 flex-1" style={{ backgroundColor: transportColor, opacity: 0.25 }} />
      </div>

      {/* 카드 본문 */}
      <div className="flex-1 my-1 py-2.5 px-3 rounded-xl border bg-white shadow-sm"
        style={{ borderColor: transportColor + '40' }}>

        {/* 이동수단 선택 버튼 행 */}
        <div className="relative mb-2">
          <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin" ref={scrollRef}>
            {TRANSPORT_OPTIONS.map(({ value, icon: Icon, label, color, reservable }) => {
              const isActive = currentTransport === value;
              return (
                <button
                  key={value}
                  onClick={() => {
                    // bus 선택 시 내부값 'bus' 저장 (subway 제거로 통합)
                    onUpdateTransport(placeIndex, value);
                    if (!reservable && place.reservation) {
                      onUpdateReservation(placeIndex, '');
                    }
                  }}
                  title={label}
                  className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-all border"
                  style={{
                    backgroundColor: isActive ? color + '18' : 'transparent',
                    borderColor: isActive ? color : '#e5e7eb',
                    color: isActive ? color : '#9ca3af',
                  }}
                >
                  <Icon size={14} />
                </button>
              );
            })}
          </div>
          {showHint && (
            <div className="absolute right-0 top-0 h-8 flex items-center pl-4 pointer-events-none"
              style={{ background: 'linear-gradient(to right, transparent, white 40%)' }}>
              <FaChevronRight size={10} className="text-gray-400 animate-pulse" />
            </div>
          )}
        </div>

        {/* 소요시간 · 거리 · 환승정보 */}
        <div className="flex items-center gap-2 flex-wrap">
          {segTimeStr && (
            <span className="text-xs font-semibold" style={{ color: transportColor }}>{segTimeStr}</span>
          )}
          {segDistStr && (
            <span className="text-xs text-gray-400">{segDistStr}</span>
          )}
          {hasTransitDetail && (
            <button
              onClick={() => setOpen(v => !v)}
              className="flex items-center gap-0.5 ml-auto text-blue-400 hover:text-blue-600 transition-colors text-xs"
            >
              <FaExchangeAlt size={9} />
              <span>환승정보</span>
              {open ? <FaChevronDown size={8} /> : <FaChevronRight size={8} />}
            </button>
          )}
        </div>

        {/* 환승 상세 패널 */}
        {open && hasTransitDetail && (
          <TransitDetailPanel transitDetail={seg.transitDetail} />
        )}

        {/* 유료도로 안내 (자동차 + hasToll) */}
        {hasToll && (
          <div className="mt-1.5 flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-amber-50 border border-amber-200">
            <FaRoad size={10} className="text-amber-500 flex-shrink-0" />
            <span className="text-xs text-amber-700 font-medium">유료도로 포함 구간</span>
          </div>
        )}

        {/* 광역 구간 기차 이용 안내 (50km 이상 + ODsay 경로 없음) */}
        {showLongDistanceHint && (
          <div className="mt-1.5 p-2.5 rounded-lg bg-amber-50 border border-amber-200">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-sm">🚆</span>
              <span className="text-xs font-semibold text-amber-800">장거리 구간 — 기차 이용 추천</span>
            </div>
            <p className="text-xs text-amber-700 leading-relaxed">
              버스·지하철 직통 경로가 없습니다.<br/>
              KTX·SRT·무궁화 등 <strong>기차</strong>로 이동수단을 변경하면 예약번호를 저장할 수 있습니다.
            </p>
          </div>
        )}

        {/* 예약 정보 입력 (예약 가능 수단일 때) */}
        {isReservable && (
          <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-center gap-1.5 mb-1">
              <FaTicketAlt size={10} className="text-amber-500" />
              <span className="text-xs font-medium text-amber-700">
                {transportOpt.label} 예약정보
              </span>
            </div>
            <input
              type="text"
              placeholder={transportOpt.placeholder}
              value={place.reservation || ''}
              onChange={(e) => onUpdateReservation(placeIndex, e.target.value)}
              className="w-full text-xs border border-amber-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-400 bg-white"
            />
            {place.reservation && (
              <div className="mt-1 flex items-center gap-1 text-xs text-amber-600">
                <FaCheck size={8} />
                <span>예약번호 저장됨</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const PlaceList = ({ places, routeSegments = [], onReorder, onToggleCheck, onDelete, onUpdateNote, onUpdateTransport, onUpdateReservation }) => {
  const handleDragEnd = (result) => {
    if (!result.destination) return;

    const items = Array.from(places);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    const reordered = items.map((item, index) => ({
      ...item,
      order: index + 1
    }));

    onReorder(reordered);
  };

  if (places.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p className="text-lg">아직 장소가 없습니다</p>
        <p className="text-sm mt-1">위 검색창에서 장소를 추가해보세요</p>
      </div>
    );
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Droppable droppableId="places">
        {(provided) => (
          <div
            {...provided.droppableProps}
            ref={provided.innerRef}
          >
            {places.map((place, index) => {
              // 이 장소로 오는 구간 (index-1번 세그먼트)
              const seg = index > 0 ? routeSegments[index - 1] : null;

              return (
                <div key={place._id || place.id || `place-${index}`}>
                  {/* ── 구간 카드 (출발지 제외) ── */}
                  {index > 0 && (
                    <SegmentCard
                      placeIndex={index}
                      place={place}
                      seg={seg}
                      onUpdateTransport={onUpdateTransport}
                      onUpdateReservation={onUpdateReservation}
                    />
                  )}

                  {/* ── 장소 카드 ── */}
                  <Draggable
                    draggableId={String(place._id || place.id || `place-${index}`)}
                    index={index}
                  >
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className={`bg-white p-3 rounded-lg border transition-shadow ${
                          snapshot.isDragging ? 'shadow-lg border-blue-300' : 'border-gray-200 shadow-sm'
                        } ${place.checked ? 'opacity-60' : ''}`}
                      >
                        {/* 상단 행: 드래그핸들 + 번호 + 장소명 + 버튼 */}
                        <div className="flex items-center gap-2">
                          <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing flex-shrink-0">
                            <FaGripVertical className="text-gray-300" size={13} />
                          </div>

                          <div className="flex-shrink-0 w-7 h-7 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold text-xs">
                            {place.order}
                          </div>

                          <div className="flex-1 min-w-0">
                            <p className={`font-semibold text-sm text-gray-800 truncate ${place.checked ? 'line-through text-gray-400' : ''}`}>
                              {place.name}
                            </p>
                            <p className="text-xs text-gray-400 truncate">{place.address}</p>
                          </div>

                          {/* 우측 버튼 */}
                          <div className="flex gap-1 flex-shrink-0">
                            <button
                              onClick={() => onToggleCheck(index)}
                              className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${
                                place.checked
                                  ? 'bg-green-500 text-white'
                                  : 'bg-gray-100 text-gray-400 hover:bg-green-100 hover:text-green-600'
                              }`}
                              title={place.checked ? '완료 취소' : '완료 표시'}
                            >
                              <FaCheck size={11} />
                            </button>
                            <button
                              onClick={() => onDelete(index)}
                              className="w-7 h-7 flex items-center justify-center bg-gray-100 text-gray-400 hover:bg-red-100 hover:text-red-500 rounded-lg transition-colors"
                              title="삭제"
                            >
                              <FaTrash size={11} />
                            </button>
                          </div>
                        </div>

                        {/* 메모 입력 */}
                        <div className="mt-2 ml-9">
                          <input
                            type="text"
                            placeholder="메모 (예: 2시간 소요)"
                            value={place.note || ''}
                            onChange={(e) => onUpdateNote(index, e.target.value)}
                            className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                        </div>
                      </div>
                    )}
                  </Draggable>
                </div>
              );
            })}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
};

export default PlaceList;
