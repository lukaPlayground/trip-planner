import { useState } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

// subway→bus, taxi→car 레거시 호환 (PlaceList와 동일 정책)
const normalizeTransport = (t) =>
  t === 'subway' ? 'bus' : t === 'taxi' ? 'car' : (t || 'bus');

const TRANSPORT_LABELS = {
  walk: '도보', bicycle: '자전거', motorcycle: '바이크',
  bus: '대중교통', train: '기차',
  car: '자동차', ship: '배', plane: '비행기',
};

const TRANSPORT_COLORS = {
  walk: '#10b981', bicycle: '#34d399', motorcycle: '#a855f7',
  bus: '#3b82f6', train: '#8b5cf6',
  car: '#f97316', ship: '#06b6d4', plane: '#ec4899',
};

// 여행 계획 내보내기 커스텀 훅
// mapContainerRef: 지도 DOM 참조 (지도 캡처용)
// routeSegments: 구간별 {time(초), distance(km), transitDetail, hasToll}
export const useExport = ({ plan, places, routeInfo, routeSegments = [], mapContainerRef }) => {
  const [exporting, setExporting] = useState('');

  const formatTime = (seconds) => {
    if (!seconds) return '';
    if (seconds >= 3600) {
      return `${Math.floor(seconds / 3600)}시간 ${Math.round((seconds % 3600) / 60)}분`;
    }
    return `${Math.round(seconds / 60)}분`;
  };

  // 지도 영역 캡처 (Leaflet 타일 포함)
  // ※ 로컬호스트/CORS 환경에서는 타일이 빠진 회색 배경으로 찍힐 수 있음
  const captureMap = async () => {
    const mapEl = mapContainerRef?.current;
    if (!mapEl) return null;
    try {
      const canvas = await html2canvas(mapEl, {
        scale: 1.5,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#e8e8e8',
        logging: false,
      });
      return canvas;
    } catch (e) {
      console.warn('지도 캡처 실패:', e.message);
      return null;
    }
  };

  // 환승 상세 HTML (대중교통 구간용)
  const buildTransitDetailHtml = (transitDetail) => {
    if (!transitDetail || transitDetail.length === 0) return '';

    const rows = transitDetail.map((d) => {
      if (d.type === 'walk') {
        return `
          <div style="font-size:11px;color:#9ca3af;padding:2px 0 2px 4px;">
            🚶 도보${d.sectionTime ? ` ${d.sectionTime}분` : ''}${d.distance ? ` (${d.distance}m)` : ''}
          </div>`;
      }
      const isBus = d.type === 'bus';
      const lineColor = isBus ? '#3b82f6' : '#6366f1';
      const icon = isBus ? '🚌' : '🚇';
      const lines = (d.lines || []).join(', ') || (isBus ? '버스' : '지하철');
      const stations = (d.boardStation && d.alightStation && d.boardStation !== d.alightStation)
        ? ` · ${d.boardStation} → ${d.alightStation}` : (d.boardStation ? ` · ${d.boardStation}` : '');
      const count = d.stationCount > 0 ? ` (${d.stationCount}정류장)` : '';
      const time = d.sectionTime ? ` ${d.sectionTime}분` : '';
      return `
        <div style="font-size:11px;padding:2px 0 2px 4px;color:${lineColor};">
          ${icon} <strong>${lines}</strong>${time}${count}
          <span style="color:#64748b;font-weight:normal;">${stations}</span>
        </div>`;
    }).join('');

    return `<div style="margin-top:4px;padding:5px 8px;background:#eff6ff;border-radius:6px;border-left:3px solid #3b82f6;">${rows}</div>`;
  };

  // 구간 카드 HTML (PlaceList의 SegmentCard에 대응)
  const buildSegmentHtml = (place, segIndex) => {
    const transport = normalizeTransport(place.transport);
    const label = TRANSPORT_LABELS[transport] || transport;
    const color = TRANSPORT_COLORS[transport] || '#3b82f6';
    const seg = routeSegments[segIndex];

    const timeStr = seg?.time != null ? formatTime(seg.time) : '';
    const distStr = seg?.distance != null ? `${Number(seg.distance).toFixed(1)}km` : '';
    const hasToll = transport === 'car' && seg?.hasToll === true;
    const hasTransit = seg?.transitDetail && seg.transitDetail.length > 0;

    const metaHtml = (timeStr || distStr) ? `
      <div style="font-size:11px;color:#64748b;margin-top:3px;">
        ${timeStr ? `<strong style="color:${color};">${timeStr}</strong>` : ''}
        ${distStr ? `&nbsp;${distStr}` : ''}
        ${hasToll ? '&nbsp;<span style="color:#d97706;">🛣️ 유료도로 포함</span>' : ''}
      </div>` : '';

    const reservationHtml = place.reservation ? `
      <div style="font-size:11px;color:#d97706;margin-top:2px;">🎫 ${place.reservation}</div>` : '';

    const transitHtml = hasTransit ? buildTransitDetailHtml(seg.transitDetail) : '';

    return `
      <div style="
        margin: 4px 0;
        padding: 8px 12px;
        background: white;
        border-radius: 10px;
        border: 1px solid ${color}30;
        border-left: 3px solid ${color};
        overflow: hidden;
      ">
        <div style="font-size:12px;font-weight:600;color:${color};">
          → ${label}으로 이동
        </div>
        ${metaHtml}
        ${reservationHtml}
        ${transitHtml}
      </div>`;
  };

  // 장소 목록 HTML 생성 (html2canvas 호환 - display:flex 미사용)
  const createListHtml = () => {
    const date = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

    // 장소 카드 + 구간 카드 교대로 배치
    const placesHtml = places.map((place, idx) => {
      const transport = normalizeTransport(place.transport);
      const color = TRANSPORT_COLORS[transport] || '#3b82f6';
      const isChecked = place.checked;

      // 장소 카드
      const placeCardHtml = `
        <div style="
          padding: 12px 0;
          border-bottom: 1px solid #f1f5f9;
          ${isChecked ? 'opacity: 0.5;' : ''}
          overflow: hidden;
        ">
          <div style="
            float: left;
            width: 30px;
            height: 30px;
            border-radius: 50%;
            background: ${isChecked ? '#9ca3af' : color};
            color: white;
            text-align: center;
            line-height: 30px;
            font-weight: bold;
            font-size: 13px;
            border: 2px solid white;
            box-shadow: 0 2px 6px rgba(0,0,0,0.15);
            margin-right: 12px;
            box-sizing: border-box;
          ">${place.order}</div>
          <div style="overflow: hidden;">
            <div style="font-weight: 600; font-size: 14px; color: #1e293b; ${isChecked ? 'text-decoration: line-through;' : ''}">
              ${place.name}
            </div>
            <div style="font-size: 11px; color: #64748b; margin-top: 1px; word-break: break-all;">${place.address || ''}</div>
            ${place.note ? `<div style="font-size:11px;color:#94a3b8;margin-top:2px;">📝 ${place.note}</div>` : ''}
          </div>
          <div style="clear: both;"></div>
        </div>`;

      // 구간 카드 (다음 장소로 가는 구간 — 마지막 장소 제외)
      const segmentCardHtml = (idx < places.length - 1 && place.transport)
        ? buildSegmentHtml(places[idx + 1], idx)
        : '';

      return placeCardHtml + segmentCardHtml;
    }).join('');

    const summaryHtml = `
      <div style="padding: 10px 0; border-bottom: 2px solid #e2e8f0; margin-bottom: 4px; font-size: 12px; color: #475569;">
        장소 <strong>${places.length}</strong>개 &nbsp;
        <span style="color: #10b981;">완료 <strong>${places.filter(p => p.checked).length}/${places.length}</strong></span>
        ${routeInfo?.totalDistance > 0 ? `&nbsp; <span style="color: #3b82f6;">총 <strong>${routeInfo.totalDistance.toFixed(1)}km</strong></span>` : ''}
        ${routeInfo?.totalTime > 0 ? `&nbsp; <span style="color: #f97316;">약 <strong>${formatTime(routeInfo.totalTime)}</strong></span>` : ''}
      </div>
    `;

    // 794px: A4 용지 픽셀 너비 (96dpi 기준)
    // html2canvas scale=2 → 실제 렌더 1588px → PDF 210mm에 딱 맞게 scaling됨
    return `
      <div id="trip-print" style="
        width: 794px;
        padding: 36px 44px;
        font-family: -apple-system, BlinkMacSystemFont, 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif;
        background: white;
        color: #1e293b;
        box-sizing: border-box;
        word-break: keep-all;
        overflow-wrap: break-word;
      ">
        <div style="margin-bottom: 18px; padding-bottom: 12px; border-bottom: 3px solid #3b82f6;">
          <div style="font-size: 10px; color: #3b82f6; font-weight: 700; letter-spacing: 0.12em; margin-bottom: 3px;">TRIP PLANNER</div>
          <h1 style="font-size: 22px; font-weight: 800; color: #1e293b; margin: 0 0 3px;">${plan.planName}</h1>
          ${plan.description ? `<p style="font-size: 12px; color: #64748b; margin: 0;">${plan.description}</p>` : ''}
          <div style="font-size: 10px; color: #94a3b8; margin-top: 5px;">내보낸 날짜: ${date}</div>
        </div>
        ${summaryHtml}
        <div>${placesHtml}</div>
        <div style="margin-top: 18px; text-align: center; font-size: 9px; color: #cbd5e1;">
          Trip Planner · 여행계획 지도 도우미
        </div>
      </div>
    `;
  };

  // PDF 내보내기 (지도 + 목록)
  const exportToPDF = async () => {
    if (!plan || places.length === 0) return;
    setExporting('pdf');
    try {
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfWidth = pdf.internal.pageSize.getWidth();   // 210mm
      const pdfHeight = pdf.internal.pageSize.getHeight(); // 297mm

      // 1. 지도 캡처 시도 (CORS 실패 시 null → 목록만 첫 페이지부터)
      const mapCanvas = await captureMap();
      if (mapCanvas) {
        const mapImgData = mapCanvas.toDataURL('image/png');
        const mapH = Math.min((mapCanvas.height * pdfWidth) / mapCanvas.width, pdfHeight * 0.48);
        pdf.addImage(mapImgData, 'PNG', 0, 0, pdfWidth, mapH);

        const lineY = mapH + 4;
        pdf.setDrawColor(59, 130, 246);
        pdf.setLineWidth(0.5);
        pdf.line(10, lineY, pdfWidth - 10, lineY);
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(30, 41, 59);
        pdf.text(plan.planName, 10, lineY + 7);
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(148, 163, 184);
        pdf.text('Trip Planner', pdfWidth - 10, lineY + 7, { align: 'right' });
      }

      // 2. 목록 HTML → html2canvas → 새 페이지 (or 첫 페이지)
      const container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.left = '-9999px';
      container.style.top = '0';
      container.style.zIndex = '-1';
      container.innerHTML = createListHtml();
      document.body.appendChild(container);

      const listElement = container.querySelector('#trip-print');
      const listCanvas = await html2canvas(listElement, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        // 고정 너비 794px 그대로 캡처 (windowWidth 무시)
        windowWidth: 794 + 88, // padding 포함 컨테이너 너비
      });
      document.body.removeChild(container);

      const listImgData = listCanvas.toDataURL('image/png');
      // A4 너비에 꽉 채워 높이 비율 계산
      const listImgHeight = (listCanvas.height * pdfWidth) / listCanvas.width;

      if (mapCanvas) {
        pdf.addPage();
      }

      // 여러 페이지 분할 출력
      let heightLeft = listImgHeight;
      let position = 0;
      pdf.addImage(listImgData, 'PNG', 0, position, pdfWidth, listImgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft > 0) {
        position -= pdfHeight;
        pdf.addPage();
        pdf.addImage(listImgData, 'PNG', 0, position, pdfWidth, listImgHeight);
        heightLeft -= pdfHeight;
      }

      pdf.save(`${plan.planName}-여행계획.pdf`);
    } catch (error) {
      console.error('PDF 내보내기 실패:', error);
      alert('PDF 내보내기에 실패했습니다.');
    } finally {
      setExporting('');
    }
  };

  // 화면 캡처 - 사이드바 목록 영역만 캡처 (지도 타일 CORS 문제 회피)
  // dashboard-main 전체 대신 목록 HTML을 별도 생성해 캡처
  const exportScreenshot = async () => {
    if (!plan || places.length === 0) return;
    setExporting('img');
    try {
      // 목록 HTML을 화면 밖에 렌더링 후 캡처 (CORS 이슈 없음)
      const container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.left = '-9999px';
      container.style.top = '0';
      container.style.zIndex = '-1';
      container.innerHTML = createListHtml();
      document.body.appendChild(container);

      const listElement = container.querySelector('#trip-print');
      const canvas = await html2canvas(listElement, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: 794 + 88,
      });
      document.body.removeChild(container);

      const link = document.createElement('a');
      link.download = `${plan.planName}-여행계획.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('화면 캡처 실패:', error);
      alert('화면 캡처에 실패했습니다.');
    } finally {
      setExporting('');
    }
  };

  return { exportToPDF, exportScreenshot, exporting };
};
