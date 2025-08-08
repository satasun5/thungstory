/* src/App.jsx ─ React + Leaflet + exifr + PapaParse + Tailwind */
import { useState, useRef, useEffect } from "react";
import L from "leaflet";
import * as exifr from "exifr";
import Papa from "papaparse";
import "./index.css";

/* ── 설정 ─────────────────────────────── */
const COLORS = ["red", "blue", "green", "orange", "purple"];
const MIN_FOR_PREDICT = 30;   // 화살표 표시 최소 마커 수
const ARROW_FACTOR = 2;       // ① 화살표 길이 배율 (2 = 2배)

/* 무게중심 */
const centroid = (arr) => ({
  lat: arr.reduce((a, b) => a + b.lat, 0) / arr.length,
  lng: arr.reduce((a, b) => a + b.lng, 0) / arr.length,
});

export default function App() {
  /* 상태 */
  const [markers, setMarkers]       = useState([]);
  const [uploadColor, setUploadColor] = useState("red");
  const [filterColors, setFilterColors] = useState([...COLORS]);
  const [selectedDate, setSelectedDate] = useState("");

  /* 지도 참조 */
  const mapRef   = useRef(null);
  const layerRef = useRef(null);
  const arrowRef = useRef(null);   // 화살표 LayerGroup

  /* ── 지도 초기화 ───────────────────── */
  useEffect(() => {
    if (!mapRef.current) {
      mapRef.current = L.map("map").setView([37.5665, 126.9780], 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap contributors",
      }).addTo(mapRef.current);
      layerRef.current = L.layerGroup().addTo(mapRef.current);
    }
  }, []);

  /* ── 날짜·색 필터 적용 ─────────────── */
  const displayMarkers = markers.filter((m) => {
    const dateOK = selectedDate
      ? new Date(m.time).toISOString().slice(0, 10) === selectedDate
      : true;
    const colorOK = filterColors.includes(m.color);
    return dateOK && colorOK;
  });

  /* ── 마커 렌더링 ───────────────────── */
  useEffect(() => {
    if (!layerRef.current) return;
    layerRef.current.clearLayers();
    displayMarkers.forEach((m) =>
      L.circleMarker([m.lat, m.lng], {
        radius: 6,
        color: m.color,
        fillColor: m.color,
        fillOpacity: 0.9,
      })
        .addTo(layerRef.current)
        .bindPopup(
          `<b>${m.name}</b><br/>${m.time}<br/>색: ${m.color}<br/>(${m.lat.toFixed(
            5,
          )}, ${m.lng.toFixed(5)})`,
        ),
    );
  }, [displayMarkers]);

  /* ── 사진 업로드 ──────────────────── */
  const handlePhotos = async (files) => {
    for (const file of files) {
      const gps = await exifr.gps(file).catch(() => null);
      if (!gps?.latitude) {
        alert(`${file.name} → GPS 정보 없음`);
        continue;
      }
      setMarkers((prev) => [
        ...prev,
        {
          lat: gps.latitude,
          lng: gps.longitude,
          name: file.name,
          time: new Date().toISOString(),
          color: uploadColor,
        },
      ]);
      mapRef.current.setView([gps.latitude, gps.longitude], 14);
    }
  };

  /* ── CSV 업로드 ───────────────────── */
  const handleCSV = (file) => {
    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: ({ data }) => {
        const newMarks = data.map((d, idx) => ({
          lat: Number(d.lat),
          lng: Number(d.lng),
          name: d.name || `csv_${idx}`,
          time: d.timestamp || new Date().toISOString(),
          color: d.color || uploadColor,
        }));
        setMarkers((prev) => [...prev, ...newMarks]);
        if (newMarks.length)
          mapRef.current.setView([newMarks[0].lat, newMarks[0].lng], 12);
      },
      error: (err) => alert("CSV 파싱 오류: " + err.message),
    });
  };

  /* ── 색 필터 토글 ─────────────────── */
  const toggleColor = (c) =>
    setFilterColors((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );

  /* ── 예측 화살표 그리기 ───────────── */
  const predictSpread = () => {
    if (arrowRef.current) {
      mapRef.current.removeLayer(arrowRef.current);
      arrowRef.current = null;
    }
    if (displayMarkers.length < MIN_FOR_PREDICT) return;

    const sorted = [...displayMarkers].sort(
      (a, b) => new Date(a.time) - new Date(b.time),
    );
    const mid   = Math.floor(sorted.length / 2);
    const early = centroid(sorted.slice(0, mid));
    const late  = centroid(sorted.slice(mid));

    /* 방향 벡터 + 길이 연장 */
    const dLat = late.lat - early.lat;
    const dLng = late.lng - early.lng;
    const endLat = late.lat + dLat * (ARROW_FACTOR - 1);
    const endLng = late.lng + dLng * (ARROW_FACTOR - 1);

    /* 점선 + 화살표 머리 */
    const line = L.polyline(
      [
        [early.lat, early.lng],
        [endLat,    endLng   ],
      ],
      { color: "black", weight: 4, dashArray: "8 6" },
    );

    const angleDeg =
      (Math.atan2(endLat - early.lat, endLng - early.lng) * 180) / Math.PI;

    const arrowIcon = L.divIcon({
      className: "",
      html: `<div style="transform: rotate(${angleDeg}deg);
                           font-size:28px; color:black;">➤</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });

    const arrowHead = L.marker([endLat, endLng], { icon: arrowIcon });

    arrowRef.current = L.layerGroup([line, arrowHead])
      .addTo(mapRef.current)
      .bindPopup(`무게중심 이동 예측 (x${ARROW_FACTOR} 연장)`);

    mapRef.current.fitBounds(line.getBounds());
  };

  /* ── UI ───────────────────────────── */
  return (
    <div className="p-4 space-y-6">
      {/* 1. 업로드용 마커 색 선택 */}
      <section className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow">
        <h2 className="font-bold mb-2">🎨 업로드 마커 색</h2>
        <select
          value={uploadColor}
          onChange={(e) => setUploadColor(e.target.value)}
          className="border p-2 rounded dark:bg-gray-700 dark:text-gray-100"
        >
          {COLORS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </section>

      {/* 2. 날짜 필터 */}
      <section className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow">
        <h2 className="font-bold mb-2">📅 날짜별 보기</h2>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="border p-2 rounded dark:bg-gray-700 dark:text-gray-100"
        />
        <button
          onClick={() => setSelectedDate("")}
          className="ml-2 text-sm underline text-blue-600"
        >
          전체 보기
        </button>
      </section>

      {/* 3. 사진 업로드 */}
      <section className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow">
        <h2 className="font-bold mb-2">📷 사진 업로드</h2>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => handlePhotos(e.target.files)}
          className="
            file:mr-3 file:py-2 file:px-4
            file:bg-blue-600 file:text-white file:rounded-full file:border-0
            hover:file:bg-blue-700 dark:file:bg-blue-500
          "
        />
      </section>

      {/* 4. CSV 업로드 */}
      <section className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow">
        <h2 className="font-bold mb-2">🗂 CSV 업로드</h2>
        <input
          type="file"
          accept=".csv"
          onChange={(e) => handleCSV(e.target.files[0])}
          className="
            file:mr-3 file:py-2 file:px-4
            file:bg-teal-600 file:text-white file:rounded-full file:border-0
            hover:file:bg-teal-700 dark:file:bg-teal-500
          "
        />
        <p className="text-sm mt-1 text-gray-500 dark:text-gray-400">
          (헤더 예시: id,lat,lng,timestamp,name,color)
        </p>
      </section>

      {/* 5. 예측에 포함할 색 체크 */}
      <section className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow">
        <h2 className="font-bold mb-2">🔍 예측 포함 색</h2>
        {COLORS.map((c) => (
          <label key={c} className="mr-4">
            <input
              type="checkbox"
              checked={filterColors.includes(c)}
              onChange={() => toggleColor(c)}
            />{" "}
            <span style={{ color: c }}>{c}</span>
          </label>
        ))}
        <p className="text-sm mt-1">
          표시 마커 수: <b>{displayMarkers.length}</b>
        </p>
      </section>

      {/* 6. 예측 버튼 */}
      {displayMarkers.length >= MIN_FOR_PREDICT && (
        <button
          onClick={predictSpread}
          className="bg-black hover:bg-gray-800
                     text-white py-2 px-4 rounded shadow"
        >
          🚀 무게중심 이동 화살표 (x{ARROW_FACTOR})
        </button>
      )}

      {/* 7. Leaflet 지도 */}
      <div id="map" className="rounded-xl overflow-hidden shadow mt-4" />
    </div>
  );
}
