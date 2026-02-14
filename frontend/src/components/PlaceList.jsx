import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { FaGripVertical, FaTrash, FaCheck, FaWalking, FaBus, FaCar, FaTaxi } from 'react-icons/fa';

const TRANSPORT_OPTIONS = [
  { value: 'walk', icon: FaWalking, label: '도보', color: '#10b981' },
  { value: 'transit', icon: FaBus, label: '대중교통', color: '#3b82f6' },
  { value: 'car', icon: FaCar, label: '자차', color: '#f97316' },
  { value: 'taxi', icon: FaTaxi, label: '택시', color: '#eab308' },
];

const PlaceList = ({ places, onReorder, onToggleCheck, onDelete, onUpdateNote, onUpdateTransport }) => {
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
            className="space-y-2"
          >
            {places.map((place, index) => (
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

                        {/* 이동수단 선택 (2번째 장소부터 표시) */}
                        {index > 0 && (
                          <div className="flex gap-1 mt-2">
                            {TRANSPORT_OPTIONS.map(({ value, icon: Icon, label, color }) => {
                              const isActive = (place.transport || 'transit') === value;
                              return (
                                <button
                                  key={value}
                                  onClick={() => onUpdateTransport(index, value)}
                                  title={label}
                                  className="flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-all border"
                                  style={{
                                    backgroundColor: isActive ? color + '18' : 'transparent',
                                    borderColor: isActive ? color : '#e5e7eb',
                                    color: isActive ? color : '#9ca3af',
                                  }}
                                >
                                  <Icon size={12} />
                                  <span className="hidden sm:inline">{label}</span>
                                </button>
                              );
                            })}
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
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
};

export default PlaceList;
