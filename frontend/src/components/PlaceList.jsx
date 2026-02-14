import { useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { FaGripVertical, FaTrash, FaCheck, FaWalking, FaBicycle, FaMotorcycle, FaBus, FaSubway, FaTrain, FaCar, FaTaxi, FaShip, FaPlane, FaTicketAlt, FaTimes } from 'react-icons/fa';

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

const PlaceList = ({ places, onReorder, onToggleCheck, onDelete, onUpdateNote, onUpdateTransport, onUpdateReservation }) => {
  const [expandedReservation, setExpandedReservation] = useState(null);

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
                      className={`bg-white p-4 rounded-lg border transition-shadow ${
                        snapshot.isDragging ? 'shadow-lg border-blue-300' : 'border-gray-200 shadow-sm'
                      } ${place.checked ? 'opacity-50' : ''}`}
                    >
                      <div className="flex items-start gap-3">
                        <div {...provided.dragHandleProps} className="mt-1 cursor-grab active:cursor-grabbing">
                          <FaGripVertical className="text-gray-400" />
                        </div>

                        <div className="flex-shrink-0 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold text-sm">
                          {place.order}
                        </div>

                        <div className="flex-1 min-w-0">
                          <h3 className={`font-semibold text-gray-800 ${place.checked ? 'line-through text-gray-400' : ''}`}>
                            {place.name}
                          </h3>
                          <p className="text-sm text-gray-500 truncate">{place.address}</p>

                          {/* 이동수단 선택 (2번째 장소부터 표시) - 아이콘 전용 + 가로 스크롤 */}
                          {index > 0 && (
                            <div className="mt-2">
                              <div className="flex items-center gap-1.5">
                                {/* 교통수단 아이콘 스크롤 영역 */}
                                <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin min-w-0 flex-1">
                                  {TRANSPORT_OPTIONS.map(({ value, icon: Icon, label, color, reservable }) => {
                                    const isActive = currentTransport === value;
                                    return (
                                      <button
                                        key={value}
                                        onClick={() => {
                                          onUpdateTransport(index, value);
                                          // 예약 불가 교통수단 선택 시 예약정보 초기화 & 패널 닫기
                                          if (!reservable) {
                                            if (place.reservation) onUpdateReservation(index, '');
                                            if (expandedReservation === index) setExpandedReservation(null);
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

                                {/* 예약 가능한 교통수단일 때 예약 버튼 (스크롤 밖 고정) */}
                                {isReservable && (
                                  <button
                                    onClick={() => setExpandedReservation(expandedReservation === index ? null : index)}
                                    title="예약정보 입력"
                                    className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-all border ${
                                      place.reservation
                                        ? 'bg-amber-50 border-amber-400 text-amber-500'
                                        : expandedReservation === index
                                          ? 'bg-gray-100 border-gray-400 text-gray-600'
                                          : 'border-dashed border-gray-300 text-gray-400 hover:border-gray-400 hover:text-gray-500'
                                    }`}
                                  >
                                    <FaTicketAlt size={12} />
                                  </button>
                                )}
                              </div>

                              {/* 예약정보 입력 패널 */}
                              {isReservable && expandedReservation === index && (
                                <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                                  <div className="flex items-center gap-2 mb-1.5">
                                    <FaTicketAlt size={11} className="text-amber-500" />
                                    <span className="text-xs font-medium text-amber-700">
                                      {transportOpt.label} 예약정보
                                    </span>
                                    <button
                                      onClick={() => setExpandedReservation(null)}
                                      className="ml-auto text-gray-400 hover:text-gray-600"
                                    >
                                      <FaTimes size={10} />
                                    </button>
                                  </div>
                                  <input
                                    type="text"
                                    placeholder={transportOpt.placeholder}
                                    value={place.reservation || ''}
                                    onChange={(e) => onUpdateReservation(index, e.target.value)}
                                    className="w-full text-sm border border-amber-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-400 bg-white"
                                  />
                                  {place.reservation && (
                                    <div className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-600">
                                      <FaCheck size={9} />
                                      <span>예약번호 저장됨</span>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* 예약정보 미니 뱃지 (패널 닫혀있을 때, 예약번호 있으면 표시) */}
                              {isReservable && expandedReservation !== index && place.reservation && (
                                <div
                                  className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700 cursor-pointer hover:bg-amber-100 transition-colors"
                                  onClick={() => setExpandedReservation(index)}
                                >
                                  <FaTicketAlt size={9} />
                                  <span className="font-mono">{place.reservation}</span>
                                </div>
                              )}
                            </div>
                          )}

                          <input
                            type="text"
                            placeholder="메모 추가 (예: 2시간 소요)"
                            value={place.note || ''}
                            onChange={(e) => onUpdateNote(index, e.target.value)}
                            className="mt-2 w-full text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                        </div>

                        <div className="flex gap-1.5 flex-shrink-0">
                          <button
                            onClick={() => onToggleCheck(index)}
                            className={`p-2 rounded-lg transition-colors ${
                              place.checked
                                ? 'bg-green-500 text-white'
                                : 'bg-gray-100 text-gray-400 hover:bg-green-100 hover:text-green-600'
                            }`}
                            title={place.checked ? '완료 취소' : '완료 표시'}
                          >
                            <FaCheck size={14} />
                          </button>
                          <button
                            onClick={() => onDelete(index)}
                            className="p-2 bg-gray-100 text-gray-400 hover:bg-red-100 hover:text-red-500 rounded-lg transition-colors"
                            title="삭제"
                          >
                            <FaTrash size={14} />
                          </button>
                        </div>
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
