// Vercel 서버리스 함수 엔드포인트 URL (file://로 직접 열었을 경우 로컬 서버 http://localhost:3000 자동 연동)
const API_BASE_URL = window.location.protocol === "file:"
  ? "http://localhost:3000/api/dust"
  : "/api/dust";

// 시·도 선택 드롭다운 DOM 엘리먼트
const sidoSelect = document.getElementById("sido-select");

// 공기 신호등 전체 카드 컨테이너 DOM 엘리먼트
const trafficLightCard = document.getElementById("traffic-light-card");

// 공기 신호등 지역명 표시 엘리먼트
const trafficRegionEl = document.getElementById("traffic-region");

// 공기 신호등 기준 시각 표시 엘리먼트
const trafficTimeEl = document.getElementById("traffic-time");

// 공기 신호등 이모지 (🔵🟢🟠🔴) 엘리먼트
const trafficEmojiEl = document.getElementById("traffic-emoji");

// 공기 신호등 상태 텍스트 (좋음/보통/나쁨/매우나쁨) 엘리먼트
const trafficStatusEl = document.getElementById("traffic-status");

// 공기 신호등 평균 수치 숫자 엘리먼트
const trafficNumberEl = document.getElementById("traffic-number");

// 공기 신호등 한 줄 안내 문구 엘리먼트
const trafficMessageEl = document.getElementById("traffic-message");

// 로딩 및 에러 상태 메시지 엘리먼트
const statusMessageEl = document.getElementById("status-message");

// 측정소 카드 그리드 컨테이너 엘리먼트
const stationListEl = document.getElementById("station-list");

// 차트 캔버스 DOM 엘리먼트
const chartCanvasEl = document.getElementById("dust-chart");

// Chart.js 인스턴스 전역 저장 변수
let dustChartInstance = null;

// 미세먼지 등급별 정보 매핑 (1: 좋음, 2: 보통, 3: 나쁨, 4: 매우나쁨)
const GRADE_CONFIG = {
  "1": {
    emoji: "🔵",
    text: "좋음",
    themeClass: "theme-good",
    cardClass: "grade-1",
    barColor: "#2563eb",
    message: "공기가 쾌적하여 산책과 환기에 좋아요"
  },
  "2": {
    emoji: "🟢",
    text: "보통",
    themeClass: "theme-normal",
    cardClass: "grade-2",
    barColor: "#16a34a",
    message: "일상적인 야외 활동에 무리가 없어요"
  },
  "3": {
    emoji: "🟠",
    text: "나쁨",
    themeClass: "theme-bad",
    cardClass: "grade-3",
    barColor: "#ea580c",
    message: "외출 시 마스크를 챙기세요"
  },
  "4": {
    emoji: "🔴",
    text: "매우나쁨",
    themeClass: "theme-very-bad",
    cardClass: "grade-4",
    barColor: "#dc2626",
    message: "외출 시 마스크를 챙기세요 (야외활동 자제 권장)"
  }
};

// 미세먼지(PM10) 및 초미세먼지(PM25) 수치 포맷팅 헬퍼 함수
function formatDustValue(rawValue) {
  // 값이 비어있거나 결측 기호("-") 또는 숫자가 아닌 경우
  if (!rawValue || rawValue.trim() === "-" || isNaN(Number(rawValue))) {
    // "측정 안 됨"으로 표시
    return "측정 안 됨";
  }
  // 유효한 수치인 경우 단위(㎍/㎥)와 결합하여 반환
  return `${rawValue} ㎍/㎥`;
}

// 에어코리아 시간 문자열("2026-10-28 16:00")을 한국어 표기("2026년 10월 28일 16시 기준")로 변환하는 함수
function formatKoreanTime(dataTimeStr) {
  // 시간 정보가 없을 경우 대체 문구 반환
  if (!dataTimeStr || typeof dataTimeStr !== "string") {
    return "기준 시각 정보 없음";
  }

  // 정규식으로 연, 월, 일, 시 파싱
  const matched = dataTimeStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{1,2})/);
  if (matched) {
    const [, year, month, day, hour] = matched;
    // "YYYY년 M월 D일 H시 기준" 포맷으로 조합하여 반환
    return `${year}년 ${parseInt(month, 10)}월 ${parseInt(day, 10)}일 ${parseInt(hour, 10)}시 기준`;
  }

  // 매칭되지 않는 형식일 경우 뒤에 "기준"만 붙여서 반환
  return `${dataTimeStr} 기준`;
}

// 개별 측정소 등급 코드(pm10Grade)에 따른 카드 스타일 정보 반환 함수
function getStationGradeInfo(gradeCode) {
  // 1, 2, 3, 4 유효한 등급일 경우
  if (gradeCode && GRADE_CONFIG[gradeCode]) {
    return {
      cardClass: GRADE_CONFIG[gradeCode].cardClass,
      text: GRADE_CONFIG[gradeCode].text,
      barColor: GRADE_CONFIG[gradeCode].barColor
    };
  }
  // 등급 값이 없거나 비어있는 경우 은은한 회색 테마 처리
  return {
    cardClass: "grade-unknown",
    text: "정보 없음",
    barColor: "#94a3b8"
  };
}

// 상단 공기 신호등 대시보드 상태 및 안내 문구 업데이트 함수
function updateTrafficLight(regionName, avgValue, latestTimeStr) {
  // 신호등 상단 지역명 업데이트
  trafficRegionEl.textContent = regionName;

  // 최신 기준 시각 한국어로 표시
  trafficTimeEl.textContent = latestTimeStr ? formatKoreanTime(latestTimeStr) : "기준 시각 확인 불가";

  // 이전 테마 클래스 제거
  trafficLightCard.className = "traffic-light-card";

  // 유효한 평균 수치가 없을 경우 (계산 불가)
  if (avgValue === null) {
    trafficLightCard.classList.add("theme-none");
    trafficEmojiEl.textContent = "⚪";
    trafficStatusEl.textContent = "정보 없음";
    trafficNumberEl.textContent = "측정 안 됨";
    trafficMessageEl.textContent = "현재 측정 가능한 대기오염 정보가 없습니다";
    return;
  }

  // 평균 수치 소수점 첫째 자리까지 표시
  trafficNumberEl.textContent = avgValue.toFixed(1);

  // 평균 수치 기준 등급 판별 (좋음/보통/나쁨/매우나쁨)
  let gradeKey = "2"; // 기본 보통
  if (avgValue <= 30) {
    gradeKey = "1"; // 0 ~ 30 좋음
  } else if (avgValue <= 80) {
    gradeKey = "2"; // 31 ~ 80 보통
  } else if (avgValue <= 150) {
    gradeKey = "3"; // 81 ~ 150 나쁨
  } else {
    gradeKey = "4"; // 151 이상 매우나쁨
  }

  // 판별된 등급 설정 객체 가져오기
  const config = GRADE_CONFIG[gradeKey];

  // 신호등 카드 테마 클래스 부여
  trafficLightCard.classList.add(config.themeClass);

  // 신호등 이모지(🔵🟢🟠🔴) 설정
  trafficEmojiEl.textContent = config.emoji;

  // 신호등 대표 상태 텍스트 설정
  trafficStatusEl.textContent = config.text;

  // 한 줄 안내 문구 (나쁨 이상이면 '외출 시 마스크를 챙기세요') 설정
  trafficMessageEl.textContent = config.message;
}

// Chart.js를 이용해 미세먼지 수치 상위 10개 측정소 가로 막대그래프를 그리는 함수
function renderDustChart(stations) {
  // Chart.js 라이브러리가 로드되지 않은 경우 안전하게 종료
  if (typeof Chart === "undefined" || !chartCanvasEl) {
    console.warn("Chart.js 라이브러리가 로드되지 않아 그래프 생성을 건너뜁니다.");
    return;
  }

  // '측정 안 됨'인 측정소는 필터링하여 제외하고 수치형 객체로 매핑
  const validStations = stations
    .filter((s) => s.pm10Value && s.pm10Value.trim() !== "-" && !isNaN(Number(s.pm10Value)))
    .map((s) => ({
      name: s.stationName || "측정소",
      value: Number(s.pm10Value),
      grade: s.pm10Grade
    }));

  // 수치가 높은 순(내림차순)으로 정렬하고 상위 10개만 추출
  const topStations = validStations
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // 기존에 그려진 차트가 있다면 메모리 누수 방지를 위해 파기
  if (dustChartInstance) {
    dustChartInstance.destroy();
    dustChartInstance = null;
  }

  // 상위 측정소 데이터가 없는 경우 종료
  if (topStations.length === 0) {
    return;
  }

  // 가로 막대그래프의 라벨(측정소명) 배열 추출
  const labels = topStations.map((s) => s.name);
  // 막대별 미세먼지 수치 데이터 배열 추출
  const dataValues = topStations.map((s) => s.value);
  // 각 막대의 색상을 해당 측정소의 등급 색과 동일하게 매핑
  const barColors = topStations.map((s) => {
    const info = getStationGradeInfo(s.grade);
    return info.barColor;
  });

  try {
    // Chart.js 가로 막대그래프 생성
    dustChartInstance = new Chart(chartCanvasEl, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          {
            label: "미세먼지 (PM10)",
            data: dataValues,
            backgroundColor: barColors,
            borderColor: barColors,
            borderWidth: 1,
            borderRadius: 6, // 막대 끝 모서리 둥글게
            barPercentage: 0.7 // 막대 두께 비율
          }
        ]
      },
      options: {
        indexAxis: "y", // 가로 막대그래프 설정
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false // 단일 데이터셋이므로 범례 숨김
          },
          tooltip: {
            callbacks: {
              // 툴팁 수치 뒤에 한국어 단위(㎍/㎥) 추가 표시
              label: function (context) {
                return ` 미세먼지 수치: ${context.parsed.x} ㎍/㎥`;
              }
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: {
              color: "#f1f5f9" // 은은한 그리드 눈금선
            },
            ticks: {
              font: {
                family: "Pretendard"
              },
              // x축 눈금 레이블에 단위 표기
              callback: function (val) {
                return `${val} ㎍/㎥`;
              }
            }
          },
          y: {
            grid: {
              display: false // y축 눈금선 숨김
            },
            ticks: {
              font: {
                family: "Pretendard",
                weight: "bold",
                size: 13
              },
              color: "#1e293b"
            }
          }
        }
      }
    });
  } catch (chartErr) {
    console.error("차트 생성 중 오류:", chartErr);
  }
}

// 측정소 목록을 받아와 화면에 은은한 카드들과 차트를 렌더링하는 함수
function renderStations(regionName, stations) {
  // 이전 측정소 카드 목록 비우기
  stationListEl.innerHTML = "";

  // 유효한 미세먼지 수치를 모을 배열
  const validPm10Values = [];
  // 데이터 중 가장 최근 측정 시각 저장 변수
  let latestTime = "";

  // 각 측정소 데이터를 순회하며 카드 생성
  stations.forEach((station) => {
    // 측정소의 등급 및 텍스트 정보 가져오기
    const gradeInfo = getStationGradeInfo(station.pm10Grade);
    // 미세먼지 수치 포맷팅 ("측정 안 됨" 또는 "XX ㎍/㎥")
    const pm10Text = formatDustValue(station.pm10Value);
    // 초미세먼지 수치 포맷팅 ("측정 안 됨" 또는 "XX ㎍/㎥")
    const pm25Text = formatDustValue(station.pm25Value);
    // 한국어 측정 시각 포맷팅 ("2026년 10월 28일 16시 기준")
    const timeText = formatKoreanTime(station.dataTime);

    // 대표 시각을 위해 유효한 측정 시각 기록
    if (station.dataTime && !latestTime) {
      latestTime = station.dataTime;
    }

    // 미세먼지 값이 유효한 숫자인 경우만 평균 계산 배열에 포함
    if (station.pm10Value && station.pm10Value.trim() !== "-" && !isNaN(Number(station.pm10Value))) {
      validPm10Values.push(Number(station.pm10Value));
    }

    // 측정소 카드 article 요소 생성
    const card = document.createElement("article");
    // 등급 색이 은은하게 반영되는 테두리/배경 클래스 부여
    card.className = `station-card ${gradeInfo.cardClass}`;

    // 카드 내부 마크업 구성 (측정소명, 등급 배지, 미세먼지, 초미세먼지, 한국어 측정시각)
    card.innerHTML = `
      <header class="station-card-header">
        <h2 class="station-name">${station.stationName || "측정소"}</h2>
        <span class="station-badge">${gradeInfo.text}</span>
      </header>
      <div class="dust-info-list">
        <div class="dust-row">
          <span class="dust-label">미세먼지 (PM10)</span>
          <span class="dust-value">${pm10Text}</span>
        </div>
        <div class="dust-row">
          <span class="dust-label">초미세먼지 (PM2.5)</span>
          <span class="dust-value">${pm25Text}</span>
        </div>
      </div>
      <footer class="station-time">
        ${timeText}
      </footer>
    `;

    // 전체 카드 그리드에 추가
    stationListEl.appendChild(card);
  });

  // 유효한 측정값이 있는 경우 평균 계산
  if (validPm10Values.length > 0) {
    const sum = validPm10Values.reduce((acc, cur) => acc + cur, 0);
    const avg = sum / validPm10Values.length;
    // 신호등 대시보드 업데이트
    updateTrafficLight(regionName, avg, latestTime);
  } else {
    // 측정 가능한 수치가 없을 경우
    updateTrafficLight(regionName, null, latestTime);
  }

  // 상위 10개 측정소 가로 막대그래프 렌더링 호출
  renderDustChart(stations);
}

// 실시간 대기오염 정보를 서버리스 API에서 가져오는 비동기 함수
async function fetchAirQualityData(sidoName) {
  // 데이터를 불러오는 동안 화면에 '불러오는 중...' 표시
  statusMessageEl.textContent = `'${sidoName}' 지역의 공기 신호등을 불러오는 중...`;
  // 기존 측정소 목록 초기화
  stationListEl.innerHTML = "";

  // 공기 신호등 카드를 로딩 상태로 즉시 변경
  trafficLightCard.className = "traffic-light-card theme-loading";
  trafficRegionEl.textContent = sidoName;
  trafficTimeEl.textContent = "불러오는 중...";
  trafficEmojiEl.textContent = "⏳";
  trafficStatusEl.textContent = "불러오는 중...";
  trafficNumberEl.textContent = "-";
  trafficMessageEl.textContent = "실시간 대기오염 데이터를 가져오고 있습니다...";

  // 기존 차트가 있다면 파기하여 로딩 상태 유지
  if (dustChartInstance) {
    dustChartInstance.destroy();
    dustChartInstance = null;
  }

  try {
    // API 요청 URL 조립
    const requestUrl = `${API_BASE_URL}?sido=${encodeURIComponent(sidoName)}`;

    // 서버리스 함수 비동기 호출
    const response = await fetch(requestUrl);

    // 응답 텍스트 추출
    const rawText = await response.text();

    // JSON 파싱 시도
    let data;
    try {
      data = JSON.parse(rawText);
    } catch (parseErr) {
      throw new Error("서버 응답을 JSON으로 파싱할 수 없습니다. (서버 상태를 확인하세요)");
    }

    // 서버 오류 또는 에러 메시지 확인
    if (!response.ok || data.error) {
      throw new Error(data.error || `서버 응답 오류 (${response.status})`);
    }

    // 측정소 데이터 배열 추출
    const items = data?.response?.body?.items;

    // 측정소 목록이 비어있는 경우
    if (!items || items.length === 0) {
      statusMessageEl.innerHTML = `
        <div style="padding:16px; background:#fef3c7; border:1px solid #f59e0b; border-radius:10px; color:#92400e; font-weight:600;">
          '${sidoName}' 지역은 현재 에어코리아에서 실시간 데이터를 제공하지 않거나 점검 중입니다.<br>
          <small style="font-weight:normal;">다른 지역(예: 서울, 경기, 부산)을 선택해 보세요.</small>
        </div>
      `;
      updateTrafficLight(sidoName, null, null);
      return;
    }

    // 로딩 메시지 지우기
    statusMessageEl.textContent = "";

    // 화면에 공기 신호등, 막대그래프 및 측정소 카드 렌더링
    renderStations(sidoName, items);

  } catch (error) {
    console.error("데이터 로딩 실패:", error);
    // 상세 원인 안내 박스 표시
    statusMessageEl.innerHTML = `
      <div style="padding:20px; background:#fef2f2; border:1.5px solid #ef4444; border-radius:12px; color:#991b1b; text-align:left; max-width:600px; margin:0 auto;">
        <p style="font-size:1.05rem; font-weight:800; margin-bottom:8px;">🚨 대기오염 정보를 불러올 수 없습니다</p>
        <p style="font-size:0.9rem; margin-bottom:12px; color:#b91c1c;">오류 내용: ${error.message}</p>
        <div style="font-size:0.85rem; color:#4b5563; border-top:1px dashed #fca5a5; padding-top:10px; line-height:1.6;">
          <strong>💡 원인 점검 체크리스트:</strong><br>
          1. 브라우저 주소창이 <strong>http://localhost:3000</strong> 인지 확인해 주세요.<br>
          &nbsp;&nbsp;&nbsp;(파일 더블클릭 <code>file:///...</code> 경로가 아닌 로컬 서버 주소여야 합니다)<br>
          2. 터미널에서 <code>node server.js</code> 서버가 켜져 있는지 확인해 주세요.<br>
          3. <strong>F5(새로고침)</strong>를 눌러 다시 시도해 주세요.
        </div>
      </div>
    `;
    // 신호등 상태 에러로 초기화
    updateTrafficLight(sidoName, null, null);
  }
}

// 시·도 드롭다운 변경 시 해당 지역 데이터 자동 요청
sidoSelect.addEventListener("change", (e) => {
  const selectedSido = e.target.value;
  fetchAirQualityData(selectedSido);
});

// 문서 로드 완료 시 기본 선택된 '서울' 데이터 즉시 호출
window.addEventListener("DOMContentLoaded", () => {
  fetchAirQualityData(sidoSelect.value);
});
