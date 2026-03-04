import { useRef, useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { FaGripVertical, FaTrash, FaCheck, FaWalking, FaBicycle, FaMotorcycle, FaBus, FaSubway, FaTrain, FaCar, FaShip, FaPlane, FaTicketAlt, FaChevronRight, FaChevronDown, FaExchangeAlt, FaRoad, FaExternalLinkAlt, FaMapMarkerAlt } from 'react-icons/fa';

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
// ── 지하철 호선별 공식 컬러 ──
const SUBWAY_LINE_COLORS = {
  '1호선':        '#0052A4',
  '2호선':        '#00A84D',
  '3호선':        '#EF7C1C',
  '4호선':        '#00A5DE',
  '5호선':        '#996CAC',
  '6호선':        '#CD7C2F',
  '7호선':        '#747F00',
  '8호선':        '#E6186C',
  '9호선':        '#BDB092',
  '수인분당선':   '#F5A200',
  '분당선':       '#F5A200',
  '신분당선':     '#D4003B',
  '경의중앙선':   '#77C4A3',
  '경의선':       '#77C4A3',
  '중앙선':       '#77C4A3',
  '공항철도':     '#0090D2',
  '경춘선':       '#0C8E72',
  'GTX-A':        '#9B1B30',
  'GTX-B':        '#006AB6',
  'GTX-C':        '#00923F',
  '우이신설':     '#B0CE18',
  '서해선':       '#81AAF9',
  '경강선':       '#003DA5',
  '김포골드라인': '#AD8605',
};

const getSubwayLineColor = (lineName) => {
  if (!lineName) return '#6366f1';
  for (const [key, color] of Object.entries(SUBWAY_LINE_COLORS)) {
    if (lineName.includes(key)) return color;
  }
  // "수도권 1호선" 같은 형태 폴백: 숫자 추출
  const m = lineName.match(/(\d+)호선/);
  if (m) return SUBWAY_LINE_COLORS[`${m[1]}호선`] || '#6366f1';
  return '#6366f1';
};

// ── 버스 종류별 공식 컬러 (한국 버스 번호 체계 기준) ──
// M: 광역급행(진빨강), N: 심야(남색), 마을: 연초록
// 번호 기준: 1-99=순환(노랑), 100-799=간선(파랑), 800-999=광역(빨강),
//           1000-8999=지선(초록), 9000+=광역(빨강)
const getBusLineColor = (busNo) => {
  if (!busNo) return '#3162A5';
  const s = String(busNo).trim();

  if (/^M/i.test(s)) return '#C8102E';           // 광역급행버스 (M버스)
  if (/^N/i.test(s)) return '#1A3B6A';           // 심야버스
  if (s.includes('마을') || /^[가-힣]/.test(s)) return '#5BB025'; // 마을버스

  const num = parseInt(s.replace(/\D/g, ''), 10);
  if (isNaN(num))           return '#3162A5';    // 파싱 불가 → 간선 기본
  if (num <= 99)            return '#F5BF00';    // 순환버스 (노랑)
  if (num <= 799)           return '#3162A5';    // 간선버스 (파랑)
  if (num <= 999)           return '#D31015';    // 광역버스 (빨강)
  if (num < 9000)           return '#53A439';    // 지선버스 (초록)
  return '#D31015';                              // 9000번대 광역버스 (빨강)
};

// hex → rgba 변환 (배경 투명도용)
const hexToRgba = (hex, alpha) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

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

        // 버스: 종류별 공식 컬러 / 지하철: 호선별 공식 컬러
        const getBadgeColor = (line) => isBus ? getBusLineColor(line) : getSubwayLineColor(line);

        // 패널 배경: 첫 번째 노선 컬러 8% opacity
        const firstColor = isBus ? getBusLineColor(d.lines[0] || '') : getSubwayLineColor(d.lines[0] || '');
        const bgColor = hexToRgba(firstColor, 0.08);

        return (
          <div key={i} className="px-3 py-2 border-t border-blue-100 first:border-t-0" style={{ background: bgColor }}>
            {/* 노선명 배지 + 소요시간 */}
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              {d.lines.map((line, li) => (
                <span key={li} className="inline-flex items-center gap-1 text-white text-xs font-bold px-2 py-0.5 rounded"
                  style={{ background: getBadgeColor(line) }}>
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
  isSelected,       // 지도에서 이 구간 폴리라인을 클릭한 경우 true
}) => {
  const [open, setOpen] = useState(true);
  const { scrollRef, showHint } = useScrollHint();
  const cardRef = useRef(null);

  // 선택 시: 자동 스크롤 + 환승정보 자동 펼침
  useEffect(() => {
    if (isSelected) {
      cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      setOpen(true);
    }
  }, [isSelected]);

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
  // 200km+ 자전거/도보 구간 — Haversine 직선 폴백 경고
  const showLongDistanceFallback =
    (currentTransport === 'walk' || currentTransport === 'bicycle') && seg?.longDistanceFallback === true;

  return (
    <div className="relative flex items-stretch" ref={cardRef}>
      {/* 세로 연결선 */}
      <div className="flex flex-col items-center mr-1.5" style={{ width: '24px' }}>
        <div className="w-0.5 flex-1" style={{ backgroundColor: transportColor, opacity: isSelected ? 0.7 : 0.25 }} />
      </div>

      {/* 카드 본문 */}
      <div
        className="flex-1 my-1 py-2.5 px-2 sm:px-3 rounded-xl border shadow-sm transition-all duration-200"
        style={{
          borderColor: isSelected ? transportColor : transportColor + '40',
          borderWidth: isSelected ? '1.5px' : '1px',
          backgroundColor: isSelected ? transportColor + '08' : 'white',
          boxShadow: isSelected ? `0 0 0 2px ${transportColor}30` : undefined,
        }}
      >

        {/* 이동수단 선택 버튼 행 */}
        <div className="relative mb-2">
          <div className="flex gap-0.5 overflow-x-auto pb-0.5 scrollbar-thin" ref={scrollRef}>
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
                  className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg transition-all border"
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
            <div className="absolute right-0 top-0 h-7 flex items-center pl-4 pointer-events-none"
              style={{ background: 'linear-gradient(to right, transparent, white 40%)' }}>
              <FaChevronRight size={10} className="text-gray-400 animate-pulse" />
            </div>
          )}
        </div>

        {/* 소요시간 · 거리 · 환승정보 */}
        <div className="flex items-center gap-2 flex-wrap">
          {seg?.loading && !segTimeStr && (
            <span className="text-xs text-gray-400 animate-pulse">경로 검색 중...</span>
          )}
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

        {/* 선택 시: 바이크 경유 도로명 */}
        {isSelected && seg?.streetNames && seg.streetNames.length > 0 && (
          <div className="mt-1.5 px-2 py-1.5 rounded-lg bg-violet-50 border border-violet-100">
            <div className="text-xs font-semibold text-violet-700 mb-1">주요 경유 도로</div>
            {seg.streetNames.map((name, ni) => (
              <div key={ni} className="text-xs text-gray-600 py-0.5">· {name}</div>
            ))}
          </div>
        )}

        {/* 유료도로 안내 (자동차 + hasToll) */}
        {hasToll && (
          <div className="mt-1.5 flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-amber-50 border border-amber-200">
            <FaRoad size={10} className="text-amber-500 flex-shrink-0" />
            <span className="text-xs text-amber-700 font-medium">유료도로 포함 구간</span>
          </div>
        )}

        {/* 200km+ 자전거/도보 장거리 폴백 경고 */}
        {showLongDistanceFallback && (
          <div className="mt-1.5 p-2.5 rounded-lg bg-orange-50 border border-orange-200">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-sm">⚠️</span>
              <span className="text-xs font-semibold text-orange-800">장거리 구간 — 소요시간 추정치</span>
            </div>
            <p className="text-xs text-orange-700 leading-relaxed">
              200km를 초과하는 구간으로 경로 탐색에 실패했습니다.<br />
              직선 거리 기반 평균 속도({currentTransport === 'bicycle' ? '자전거 15km/h' : '도보 5km/h'})로
              소요시간을 추정했습니다.
            </p>
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

        {/* 기차 구간 — 역 정보 + 코레일 예약 버튼 */}
        {currentTransport === 'train' && seg?.trainInfo && (
          <div className="mt-1.5 p-2.5 rounded-lg bg-violet-50 border border-violet-200">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-1.5">
                <FaTrain size={10} className="text-violet-500 flex-shrink-0" />
                <span className="text-xs font-semibold text-violet-800">역 정보</span>
              </div>
              <a
                href="https://www.korail.com/ticket/search/general"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs font-medium text-violet-600 hover:text-violet-800 transition-colors"
              >
                <span>코레일 예약</span>
                <FaExternalLinkAlt size={8} />
              </a>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-violet-700">
              <span className="font-medium">{seg.trainInfo.deptStation.name}역</span>
              <span className="text-violet-400">→</span>
              <span className="font-medium">{seg.trainInfo.arrStation.name}역</span>
              <span className="ml-auto text-violet-400">{seg.trainInfo.distKm}km</span>
            </div>
            <p className="mt-1 text-xs text-violet-500">
              ※ 소요시간은 평균 속도 기반 추정치입니다
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

const PlaceList = ({ places, routeSegments = [], selectedSegmentIndex, onReorder, onToggleCheck, onDelete, onUpdateNote, onUpdateTransport, onUpdateReservation, onPlaceClick }) => {
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
                      isSelected={selectedSegmentIndex === index - 1}
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

                          <div
                            className="flex-1 min-w-0 group cursor-pointer"
                            onClick={() => onPlaceClick && onPlaceClick(place)}
                            title="지도에서 보기"
                          >
                            <p className={`font-semibold text-sm truncate flex items-center gap-1 ${place.checked ? 'line-through text-gray-400' : 'text-gray-800 group-hover:text-blue-600'}`}>
                              {place.name}
                              <FaMapMarkerAlt size={9} className="flex-shrink-0 text-gray-300 group-hover:text-blue-400 transition-colors" />
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
