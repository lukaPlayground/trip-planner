import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Map from '../components/Map';

const TRANSPORT_LABELS = {
  walk: '도보', bicycle: '자전거', motorcycle: '바이크',
  bus: '버스', subway: '지하철', train: '기차',
  car: '자차', taxi: '택시', ship: '배', plane: '비행기',
};

const TRANSPORT_COLORS = {
  walk: '#10b981', bicycle: '#34d399', motorcycle: '#a855f7',
  bus: '#3b82f6', subway: '#6366f1', train: '#8b5cf6',
  car: '#f97316', taxi: '#eab308', ship: '#06b6d4', plane: '#ec4899',
};

const SharedPlan = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [routeInfo, setRouteInfo] = useState(null);

  useEffect(() => {
    const fetchPlan = async () => {
      try {
        const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';
        const response = await fetch(`${apiBase}/plans/shared/${id}`);
        if (!response.ok) {
          setError('공유된 계획을 찾을 수 없거나 비공개 상태입니다.');
          return;
        }
        const data = await response.json();
        setPlan(data);
      } catch {
        setError('계획을 불러오는 데 실패했습니다.');
      } finally {
        setLoading(false);
      }
    };
    fetchPlan();
  }, [id]);

  const formatTime = (seconds) => {
    if (!seconds) return '';
    if (seconds >= 3600) {
      return `${Math.floor(seconds / 3600)}시간 ${Math.round((seconds % 3600) / 60)}분`;
    }
    return `${Math.round(seconds / 60)}분`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-400 text-lg">불러오는 중...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-500 text-lg mb-4">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm"
          >
            홈으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  const places = plan.places || [];
  const checkedCount = places.filter(p => p.checked).length;

  return (
    <div className="h-screen flex flex-col">
      {/* 헤더 */}
      <header className="bg-blue-600 text-white px-4 py-3 flex justify-between items-center shadow-md z-[2000]">
        <div>
          <div className="text-xs text-blue-200 mb-0.5">공유된 여행 계획</div>
          <h1 className="text-lg font-bold">{plan.planName}</h1>
        </div>
        <button
          onClick={() => navigate('/')}
          className="text-sm px-3 py-1.5 bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors"
        >
          Trip Planner
        </button>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* 지도 */}
        <div className="w-3/5 bg-gray-200 relative">
          <Map places={places} onRouteUpdate={setRouteInfo} />
        </div>

        {/* 장소 목록 */}
        <div className="w-2/5 flex flex-col bg-gray-50 border-l border-gray-200 overflow-y-auto">
          {/* 요약 정보 */}
          <div className="p-4 border-b border-gray-200 bg-white sticky top-0 z-10">
            <p className="text-sm text-gray-500 mt-1">{plan.description}</p>
            <div className="flex gap-3 mt-2 text-sm flex-wrap">
              <span className="text-gray-500">장소 {places.length}개</span>
              {places.length > 0 && (
                <span className="text-green-600">완료 {checkedCount}/{places.length}</span>
              )}
              {routeInfo?.totalDistance > 0 && (
                <span className="text-blue-600">{routeInfo.totalDistance.toFixed(1)}km</span>
              )}
              {routeInfo?.totalTime > 0 && (
                <span className="text-orange-500">약 {formatTime(routeInfo.totalTime)}</span>
              )}
            </div>
            {places.length > 0 && (
              <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full"
                  style={{ width: `${(checkedCount / places.length) * 100}%` }}
                />
              </div>
            )}
          </div>

          {/* 장소 리스트 (읽기 전용) */}
          <div className="p-4 space-y-3">
            {places.map((place) => {
              const color = TRANSPORT_COLORS[place.transport] || '#3b82f6';
              const label = TRANSPORT_LABELS[place.transport] || '';
              return (
                <div
                  key={place._id || place.order}
                  className={`bg-white rounded-lg p-3 shadow-sm border border-gray-100 ${place.checked ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 border-2 border-white shadow"
                      style={{ background: place.checked ? '#9ca3af' : color }}
                    >
                      {place.order}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`font-semibold text-gray-800 text-sm ${place.checked ? 'line-through' : ''}`}>
                        {place.name}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5 truncate">{place.address}</div>
                      {label && (
                        <span
                          className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ background: `${color}20`, color }}
                        >
                          → {label}
                        </span>
                      )}
                      {place.reservation && (
                        <div className="text-xs text-amber-600 mt-1">🎫 {place.reservation}</div>
                      )}
                      {place.note && (
                        <div className="text-xs text-gray-400 mt-1">📝 {place.note}</div>
                      )}
                    </div>
                    {place.checked && (
                      <span className="text-green-500 text-lg">✓</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SharedPlan;
