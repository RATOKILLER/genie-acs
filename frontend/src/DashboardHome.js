// src/DashboardHome.js
import React, { useState, useEffect } from "react";
import axios from "axios";
import { Pie, Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  ArcElement,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import NavBar from "./NavBar";

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title);

// Opções padrão para os gráficos de Pizza
const pieOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: "bottom",
      labels: {
        boxWidth: 18,
        padding: 8,
        font: {
          size: 14,
          family: "'Open Sans', sans-serif",
        },
      },
    },
    tooltip: {
      backgroundColor: "rgba(0,0,0,0.8)",
      titleColor: "#fff",
      bodyColor: "#fff",
      borderColor: "#fff",
      borderWidth: 1,
      cornerRadius: 4,
      padding: 8,
    },
  },
  layout: {
    padding: {
      bottom: 10,
    },
  },
  animation: {
    animateRotate: true,
    animateScale: true,
  },
};

function DashboardHome() {
  const [devices, setDevices] = useState([]);

  // Garante que devices seja sempre um array
  const devicesArray = Array.isArray(devices) ? devices : [];

  // Função auxiliar para identificar dispositivos secundários
  const isSecondary = (dev) => {
    const s = dev.meshStatus || "";
    return s.startsWith("Em Mesh") || s.startsWith("Conectado via LAN");
  };

  // Considera apenas os dispositivos principais
  const mainDevices = devicesArray.filter((dev) => !isSecondary(dev));

  useEffect(() => {
    axios
      .get("http://10.34.250.168:5000/devices")
      .then((response) => {
        const data = Array.isArray(response.data) ? response.data : [];
        setDevices(data);
      })
      .catch((error) => console.error("Erro ao buscar dispositivos:", error));
  }, []);

  // Gráfico 1: Status dos dispositivos (apenas principais)
  const onlineCount = mainDevices.filter(
    (dev) => dev.status && dev.status.toLowerCase() === "online"
  ).length;
  const offlineCount = mainDevices.length - onlineCount;
  const statusData = {
    labels: ["Online", "Offline"],
    datasets: [
      {
        data: [onlineCount, offlineCount],
        backgroundColor: ["#31a354", "#dc3545"],
        hoverBackgroundColor: ["#2e8b57", "#c82333"],
      },
    ],
  };

  // Gráfico 2: Distribuição por fabricante (apenas principais)
  const manufacturerCounts = mainDevices.reduce((acc, dev) => {
    const mf = dev.manufacturer || "Desconhecido";
    acc[mf] = (acc[mf] || 0) + 1;
    return acc;
  }, {});
  const manufacturerData = {
    labels: Object.keys(manufacturerCounts),
    datasets: [
      {
        data: Object.values(manufacturerCounts),
        backgroundColor: ["#007bff", "#6610f2", "#6f42c1", "#e83e8c", "#fd7e14", "#20c997"],
        hoverBackgroundColor: ["#0056c2", "#520dc2", "#593196", "#c81e7f", "#c66c0c", "#1a8f73"],
      },
    ],
  };

  // Gráfico 3: Distribuição por modelos (apenas principais)
  const modelCounts = mainDevices.reduce((acc, dev) => {
    const model = dev.model || "Desconhecido";
    acc[model] = (acc[model] || 0) + 1;
    return acc;
  }, {});
  const standardPalette = [
    "#007bff", "#6610f2", "#6f42c1", "#e83e8c", "#fd7e14",
    "#20c997", "#17a2b8", "#ffc107", "#28a745", "#dc3545",
  ];
  const modelData = {
    labels: Object.keys(modelCounts),
    datasets: [
      {
        data: Object.values(modelCounts),
        backgroundColor: standardPalette.slice(0, Object.keys(modelCounts).length),
        hoverBackgroundColor: standardPalette.slice(0, Object.keys(modelCounts).length),
      },
    ],
  };

  // Gráfico 4: Tipo de conexão (apenas principais)
  const connectionCounts = mainDevices.reduce((acc, dev) => {
    const type = dev.pppoeUsername && dev.pppoeUsername.trim() !== "" ? "PPPoE" : "IPoE";
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});
  const connectionData = {
    labels: Object.keys(connectionCounts),
    datasets: [
      {
        data: Object.values(connectionCounts),
        backgroundColor: ["#17a2b8", "#ffc107"],
        hoverBackgroundColor: ["#138496", "#e0a800"],
      },
    ],
  };

  // Gráfico 5: Barras Empilhadas (Firmware / Versões de Software) para dispositivos principais
  let manufacturerModelList = [
    ...new Set(
      mainDevices.map((dev) => {
        const mf = dev.manufacturer || "Desconhecido";
        const mo = dev.model || "N/A";
        return `${mf} - ${mo}`;
      })
    ),
  ];
  manufacturerModelList.sort();

  let versions = [
    ...new Set(
      mainDevices
        .map((dev) => dev.softwareVersion || "Desconhecido")
        .filter((v) => v !== "N/A")
    ),
  ];
  versions.sort();

  const dataMatrix = versions.map((version) => {
    return manufacturerModelList.map((mfMo) => {
      const [mf, mo] = mfMo.split(" - ");
      return mainDevices.filter(
        (dev) =>
          (dev.manufacturer || "Desconhecido") === mf &&
          (dev.model || "N/A") === mo &&
          (dev.softwareVersion || "Desconhecido") === version
      ).length;
    });
  });

  const colorPalette = [
    "#007bff", "#6610f2", "#6f42c1", "#e83e8c", "#fd7e14",
    "#20c997", "#17a2b8", "#ffc107", "#28a745", "#dc3545", "#343a40",
  ];

  const stackedDatasets = versions.map((version, idx) => ({
    label: version,
    data: dataMatrix[idx],
    backgroundColor: colorPalette[idx % colorPalette.length],
  }));

  const stackedChartData = {
    labels: manufacturerModelList,
    datasets: stackedDatasets,
  };

  const stackedOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: "right" },
      title: {
        display: true,
        text: "Versões de Firmware (Fabricante - Modelo)",
        font: { size: 16, family: "'Open Sans', sans-serif" },
      },
    },
    scales: {
      x: {
        stacked: true,
        barPercentage: 0.5,
        categoryPercentage: 0.7,
        ticks: {
          autoSkip: false,
          maxRotation: 45,
          minRotation: 45,
          font: { size: 10 },
        },
      },
      y: {
        stacked: true,
        beginAtZero: true,
        ticks: { stepSize: 1, font: { size: 12 } },
      },
    },
    maxBarThickness: 30,
  };

  return (
    <div>
      <NavBar />
      <div style={{ padding: "20px" }}>
        <h2 style={{ marginBottom: "30px" }}>Página Inicial - Dashboard</h2>

        {/* Grid 2x2 para os 4 gráficos de pizza */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: "30px",
            justifyItems: "center",
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: "8px",
              boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
              width: "340px",
              height: "420px",
              padding: "20px",
              textAlign: "center",
            }}
          >
            <h3 style={{ marginBottom: "10px" }}>Status dos Dispositivos</h3>
            <div style={{ width: "300px", height: "340px", margin: "0 auto" }}>
              <Pie data={statusData} options={pieOptions} />
            </div>
          </div>

          <div
            style={{
              background: "#fff",
              borderRadius: "8px",
              boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
              width: "340px",
              height: "420px",
              padding: "20px",
              textAlign: "center",
            }}
          >
            <h3 style={{ marginBottom: "10px" }}>Dispositivos por Fabricante</h3>
            <div style={{ width: "300px", height: "340px", margin: "0 auto" }}>
              <Pie data={manufacturerData} options={pieOptions} />
            </div>
          </div>

          <div
            style={{
              background: "#fff",
              borderRadius: "8px",
              boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
              width: "340px",
              height: "420px",
              padding: "20px",
              textAlign: "center",
            }}
          >
            <h3 style={{ marginBottom: "10px" }}>Modelos de CPEs</h3>
            <div style={{ width: "300px", height: "380px", margin: "0 auto" }}>
              <Pie data={modelData} options={pieOptions} />
            </div>
          </div>

          <div
            style={{
              background: "#fff",
              borderRadius: "8px",
              boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
              width: "340px",
              height: "450px",
              padding: "20px",
              textAlign: "center",
            }}
          >
            <h3 style={{ marginBottom: "10px" }}>Tipo de Conexão</h3>
            <div style={{ width: "300px", height: "340px", margin: "0 auto" }}>
              <Pie data={connectionData} options={pieOptions} />
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: "40px",
            background: "#fff",
            borderRadius: "8px",
            boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
            padding: "20px",
            width: "90%",
            maxWidth: "1200px",
            margin: "40px auto",
            height: "450px",
          }}
        >
          <h3 style={{ textAlign: "center", marginBottom: "20px" }}>
            Versões de Firmware (Fabricante - Modelo)
          </h3>
          <Bar data={stackedChartData} options={stackedOptions} />
        </div>
      </div>
    </div>
  );
}

export default DashboardHome;
