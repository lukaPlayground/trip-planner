import { useRef, useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { FaGripVertical, FaTrash, FaCheck, FaWalking, FaBicycle, FaMotorcycle, FaBus, FaSubway, FaTrain, FaCar, FaTaxi, FaShip, FaPlane, FaTicketAlt, FaChevronRight } from 'react-icons/fa';

// 예약 가능 여부 포함
const TRANSPORT_OPTIONS = [
  { value: 'walk', icon: FaWalking, label: '도보', color: '#10b981', reservable: false },
  { value: 'bicycle', icon: FaBicycle, label: '자전거', color: '#34d399', reservable: false },
  { value: 'motorcycle', icon: FaMotorcycle, label: '바이크', color: '#a855f7', reservable: false },
  { value: 'bus', icon: FaBus, label: '버스', color: '#3b82f6', reservable: true, placeholder: '예매번호 (고속/시외버스)' },
  { value: 'subway', icon: FaSubway, label: '지하철', color: '#6366f1', reservable: false },
  { value: 'train', icon: FaTrain, label: '기차', color: '#8b5cf6', reservable: true, placeholder: '예매번호 (KTX/SRT 등)' },
  { value: 'car', icon: FaCar, label: '자차', color: '#f97316', reservable: false },
  { value: 'taxi', icon: FaTaxi, label: '택시', color: '#eab308', reservable: false },
  { value: 'ship', icon: FaShip, label: '배', color: '#06b6d4', reservable: true, placeholder: '예매번호 (여객선)' },
  { value: 'plane', icon: FaPlane, label: '비행기', color: '#ec4899', reservable: true, placeholder: '예약번호 (항공편명)' },
];

// 스크롤 가능 여부 감지 훅
const useScrollHint = () => {
  const scrollRef = useRef(null);
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const check = () => {
      // 스크롤 가능하고, 아직 끝까지 안 갔으면 힌트 표시
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

// 교통수단 버튼 행 컴포넌트
const TransportRow = ({ place, index, currentTransport, isReservable, onUpdateTransport, onUpdateReservation }) => {
  const { scrollRef, showHint } = useScrollHint();

  return (
    <div className="relative">
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin" ref={scrollRef}>
        {TRANSPORT_OPTIONS.map(({ value, icon: Icon, label, color, reservable }) => {
          const isActive = currentTransport === value;
          return (
            <button
              key={value}
              onClick={() => {
                onUpdateTransport(index, value);
                if (!reservable) {
                  if (place.reservation) onUpdateReservation(index, '');
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

      {/* 스크롤 힌트 - 더 많은 옵션이 있음을 표시 */}
      {showHint && (
        <div className="absolute right-0 top-0 h-8 flex items-center pl-4 pointer-events-none"
          style={{ background: 'linear-gradient(to right, transparent, white 40%)' }}
        >
          <FaChevronRight size={10} className="text-gray-400 animate-pulse" />
        </div>
      )}
    </div>
  );
};

const PlaceList = ({ places, onReorder, onToggleCheck, onDelete, onUpdateNote, onUpdateTransport, onUpdateReservation }) => {
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

  const getTransportOption = (value) => TRANSPORT_OPTIONS.find(t => t.value === value);

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
            className="space-y-2"
          >
            {places.map((place, index) => {
              const currentTransport = place.transport || 'bus';
              const transportOpt = getTransportOption(currentTransport);
              const isReservable = transportOpt?.reservable;

              return (
                <Draggable
                  key={place._id || place.id || `place-${index}`}
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

                      {/* 이동수단 + 예약정보 + 메모 (2번째 장소부터) */}
                      {index > 0 && (
                        <div className="mt-2 ml-9">
                          <TransportRow
                            place={place}
                            index={index}
                            currentTransport={currentTransport}
                            isReservable={isReservable}
                            onUpdateTransport={onUpdateTransport}
                            onUpdateReservation={onUpdateReservation}
                          />

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
                                onChange={(e) => onUpdateReservation(index, e.target.value)}
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
                      )}

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
