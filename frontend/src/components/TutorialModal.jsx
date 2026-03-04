import { useState } from 'react';
import { FaChevronLeft, FaChevronRight, FaTimes, FaMapMarkerAlt, FaSave, FaSearch, FaBus, FaShareAlt } from 'react-icons/fa';

const SLIDES = [
  {
    icon: '🗺️',
    title: 'Trip Planner 시작하기',
    desc: '여행 계획을 쉽게 만들고 관리하세요.\n장소를 추가하고 교통수단을 설정하면\n자동으로 경로와 소요시간을 계산해 드립니다.',
    tip: null,
  },
  {
    icon: '📋',
    title: '계획 만들기',
    desc: '상단 드롭다운에서 계획을 선택하거나\n새 계획을 만들 수 있습니다.\n여러 여행 계획을 동시에 관리할 수 있어요.',
    tip: '저장 버튼을 눌러 계획을 저장하세요. 상단에 항상 표시됩니다.',
  },
  {
    icon: '🔍',
    title: '장소 검색 & 추가',
    desc: '장소 목록 탭에서 검색창에 장소명을 입력하면\n카카오 지도 기반으로 결과를 찾아줍니다.\n추가 버튼을 눌러 계획에 장소를 넣으세요.',
    tip: '장소 카드를 드래그하면 순서를 바꿀 수 있습니다.',
  },
  {
    icon: '🚌',
    title: '교통수단 설정',
    desc: '각 목적지 사이에 교통수단을 선택하면\n실시간으로 경로와 소요시간을 계산합니다.\n대중교통은 환승 정보도 함께 제공됩니다.',
    tip: '경로 계산에는 잠깐 시간이 걸릴 수 있습니다 (경로 검색 중... 표시).',
  },
  {
    icon: '📤',
    title: '저장 & 공유',
    desc: '저장 버튼으로 계획을 저장하고,\n공유 기능으로 링크를 생성해 다른 사람과\n여행 계획을 공유할 수 있습니다.',
    tip: '지도 탭과 목록 탭을 오가며 경로를 확인하세요.',
  },
];

const STORAGE_KEY = 'tripplanner_tutorial_shown';

const TutorialModal = ({ onClose }) => {
  const [step, setStep] = useState(0);
  const [dontShow, setDontShow] = useState(false);

  const isLast = step === SLIDES.length - 1;
  const slide = SLIDES[step];

  const handleClose = () => {
    if (dontShow) {
      localStorage.setItem(STORAGE_KEY, 'true');
    }
    onClose();
  };

  const handleFinish = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* 헤더 */}
        <div className="bg-blue-600 px-5 py-4 flex items-center justify-between">
          <span className="text-white font-semibold text-sm">사용 안내</span>
          <button
            onClick={handleClose}
            className="text-white/70 hover:text-white transition-colors"
          >
            <FaTimes size={14} />
          </button>
        </div>

        {/* 슬라이드 콘텐츠 */}
        <div className="px-6 pt-6 pb-4">
          <div className="text-center mb-4">
            <div className="text-5xl mb-3">{slide.icon}</div>
            <h3 className="text-lg font-bold text-gray-800 mb-2">{slide.title}</h3>
            <p className="text-sm text-gray-500 leading-relaxed whitespace-pre-line">{slide.desc}</p>
          </div>

          {slide.tip && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5 mt-3">
              <p className="text-xs text-blue-600 leading-relaxed">💡 {slide.tip}</p>
            </div>
          )}
        </div>

        {/* 진행 점 */}
        <div className="flex justify-center gap-1.5 pb-2">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === step ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>

        {/* 푸터 */}
        <div className="px-5 pb-5 pt-1">
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep(s => s - 1)}
                className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 text-xs text-gray-500 hover:bg-gray-50 transition-colors"
              >
                <FaChevronLeft size={10} /> 이전
              </button>
            )}

            {isLast ? (
              <button
                onClick={handleFinish}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                시작하기
              </button>
            ) : (
              <button
                onClick={() => setStep(s => s + 1)}
                className="flex-1 flex items-center justify-center gap-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                다음 <FaChevronRight size={10} />
              </button>
            )}
          </div>

          {/* 다시 보지 않기 (닫기 버튼으로 나갈 때만 적용) */}
          <label className="flex items-center gap-2 mt-3 cursor-pointer">
            <input
              type="checkbox"
              checked={dontShow}
              onChange={(e) => setDontShow(e.target.checked)}
              className="w-3.5 h-3.5 accent-blue-600"
            />
            <span className="text-xs text-gray-400">다시 보지 않기</span>
          </label>
        </div>
      </div>
    </div>
  );
};

export { STORAGE_KEY };
export default TutorialModal;
