import { useState } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

// 여행 계획 내보내기 커스텀 훅
// mapContainerRef: 지도 DOM 참조 (지도 캡처용)
export const useExport = ({ plan, places, routeInfo, mapContainerRef }) => {
  const [exporting, setExporting] = useState('');

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

  const formatTime = (seconds) => {
    if (!seconds) return '';
    if (seconds >= 3600) {
      return `${Math.floor(seconds / 3600)}시간 ${Math.round((seconds % 3600) / 60)}분`;
    }
    return `${Math.round(seconds / 60)}분`;
  };

  // 지도 영역 캡처 (Leaflet 타일 포함)
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

  // 장소 목록 HTML 생성 (html2canvas 호환 - display:flex 미사용)
  const createListHtml = () => {
    const date = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

    const placesHtml = places.map((place) => {
      const transport = place.transport ? TRANSPORT_LABELS[place.transport] : '';
      const color = place.transport ? TRANSPORT_COLORS[place.transport] : '#3b82f6';
      const isChecked = place.checked;

      return `
        <div style="
          padding: 12px 0;
          border-bottom: 1px solid #f1f5f9;
          ${isChecked ? 'opacity: 0.5;' : ''}
          overflow: hidden;
        ">
          <div style="
            float: left;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background: ${isChecked ? '#9ca3af' : color};
            color: white;
            text-align: center;
            line-height: 32px;
            font-weight: bold;
            font-size: 14px;
            border: 3px solid white;
            box-shadow: 0 2px 6px rgba(0,0,0,0.15);
            margin-right: 12px;
            box-sizing: border-box;
          ">${place.order}</div>
          <div style="overflow: hidden;">
            <div style="font-weight: 600; font-size: 15px; color: #1e293b; ${isChecked ? 'text-decoration: line-through;' : ''}">
              ${place.name}
            </div>
            <div style="font-size: 12px; color: #64748b; margin-top: 2px;">${place.address || ''}</div>
            ${transport ? `
              <div style="margin-top: 5px;">
                <span style="
                  display: inline-block;
                  font-size: 11px;
                  background: ${color}20;
                  color: ${color};
                  padding: 2px 8px;
                  border-radius: 999px;
                  font-weight: 500;
                ">→ ${transport}으로 이동</span>
                ${place.reservation ? `<span style="font-size: 11px; color: #d97706; margin-left: 6px;">🎫 ${place.reservation}</span>` : ''}
              </div>
            ` : ''}
            ${place.note ? `<div style="font-size: 12px; color: #94a3b8; margin-top: 3px;">📝 ${place.note}</div>` : ''}
          </div>
          <div style="clear: both;"></div>
        </div>
      `;
    }).join('');

    const summaryHtml = `
      <div style="padding: 10px 0; border-bottom: 2px solid #e2e8f0; margin-bottom: 4px; font-size: 13px; color: #475569;">
        장소 <strong>${places.length}</strong>개 &nbsp;
        <span style="color: #10b981;">완료 <strong>${places.filter(p => p.checked).length}/${places.length}</strong></span>
        ${routeInfo?.totalDistance > 0 ? `&nbsp; <span style="color: #3b82f6;">총 <strong>${routeInfo.totalDistance.toFixed(1)}km</strong></span>` : ''}
        ${routeInfo?.totalTime > 0 ? `&nbsp; <span style="color: #f97316;">약 <strong>${formatTime(routeInfo.totalTime)}</strong></span>` : ''}
      </div>
    `;

    return `
      <div id="trip-print" style="
        width: 794px;
        padding: 40px 48px;
        font-family: -apple-system, BlinkMacSystemFont, 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif;
        background: white;
        color: #1e293b;
        box-sizing: border-box;
      ">
        <div style="margin-bottom: 20px; padding-bottom: 14px; border-bottom: 3px solid #3b82f6;">
          <div style="font-size: 11px; color: #3b82f6; font-weight: 600; letter-spacing: 0.1em; margin-bottom: 4px;">TRIP PLANNER</div>
          <h1 style="font-size: 24px; font-weight: 800; color: #1e293b; margin: 0 0 4px;">${plan.planName}</h1>
          ${plan.description ? `<p style="font-size: 13px; color: #64748b; margin: 0;">${plan.description}</p>` : ''}
          <div style="font-size: 11px; color: #94a3b8; margin-top: 6px;">내보낸 날짜: ${date}</div>
        </div>
        ${summaryHtml}
        <div>${placesHtml}</div>
        <div style="margin-top: 20px; text-align: center; font-size: 10px; color: #cbd5e1;">
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
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      // 1. 지도 캡처 시도
      const mapCanvas = await captureMap();
      if (mapCanvas) {
        const mapImgData = mapCanvas.toDataURL('image/png');
        // 지도를 A4 너비에 맞게, 최대 절반 높이까지
        const mapH = Math.min((mapCanvas.height * pdfWidth) / mapCanvas.width, pdfHeight * 0.48);
        pdf.addImage(mapImgData, 'PNG', 0, 0, pdfWidth, mapH);

        // 지도 아래 구분선
        const lineY = mapH + 4;
        pdf.setDrawColor(59, 130, 246);
        pdf.setLineWidth(0.5);
        pdf.line(10, lineY, pdfWidth - 10, lineY);
        pdf.setFontSize(13);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(30, 41, 59);
        pdf.text(plan.planName, 10, lineY + 7);
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(148, 163, 184);
        pdf.text('Trip Planner', pdfWidth - 10, lineY + 7, { align: 'right' });
      }

      // 2. 목록 HTML → html2canvas → 새 페이지
      const container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.left = '-9999px';
      container.style.top = '0';
      container.innerHTML = createListHtml();
      document.body.appendChild(container);

      const listElement = container.querySelector('#trip-print');
      const listCanvas = await html2canvas(listElement, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });
      document.body.removeChild(container);

      const listImgData = listCanvas.toDataURL('image/png');
      const listImgHeight = (listCanvas.height * pdfWidth) / listCanvas.width;

      // 지도가 있으면 새 페이지에 목록, 없으면 첫 페이지부터
      if (mapCanvas) {
        pdf.addPage();
      }

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

  // 화면 캡처 - 지도+목록 전체를 하나의 이미지로
  const exportScreenshot = async () => {
    if (!plan || places.length === 0) return;
    setExporting('img');
    try {
      const mainEl = document.getElementById('dashboard-main');
      if (!mainEl) {
        alert('캡처할 영역을 찾을 수 없습니다.');
        return;
      }
      const canvas = await html2canvas(mainEl, {
        scale: 1.5,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#f9fafb',
        logging: false,
      });

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
