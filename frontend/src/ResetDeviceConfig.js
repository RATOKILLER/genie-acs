// src/DeviceConfig.js

import React, { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { hasPermission } from "./permissions";
import "./DeviceConfig.css";

/* ---------- Helpers ---------- */
function formatUpTime(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return d > 0
    ? `${d}d ${h}h ${m}m ${s}s`
    : `${h}h ${m}m ${s}s`;
}

function formatMacAddress(raw) {
  const c = raw?.replace(/[^A-Fa-f0-9]/g, "");
  return c?.length === 12
    ? c.match(/.{2}/g).join(":").toUpperCase()
    : raw;
}

function getDeviceStatus(d) {
  return d?.status?.toLowerCase() === "online" ? "online" : "offline";
}

function buildModelKey(d) {
  if (!d) return "";
  const mf = d.manufacturer?.toUpperCase() || "";
  const md = d.model?.toUpperCase().trim() || "";
  const hw = d.hardwareVersion?.trim() || "";
  if (md.includes("ARCHER C5")) return "";
  if (mf === "FIBERHOME") return md;
  if (md.includes("ARCHER C20")) {
    const m = hw.match(/v\s*(\d+)/i);
    return m ? `ARCHER_C20_V${m[1]}` : "ARCHER_C20";
  }
  if (mf === "MERCUSYS" && (md === "MR30G" || md === "MR60X")) {
    const clean = (hw.toUpperCase().replace(md, "").trim() || "1.0").split(".")[0];
    return `${md}_V${clean}`;
  }
  const part = hw.toUpperCase().replace(/\s+/g, "_");
  return part ? `${md}_${part}` : md;
}

function getFirmwareOptionsForModel(k, list) {
  if (!Array.isArray(list)) return [];
  if (!k) return list.map((f) => f.filename || "");
  const esc = k.replace(/\./g, "\\.");
  const re = new RegExp(`^${esc}.*\\.bin$`, "i");
  return list.filter((f) => f.filename && re.test(f.filename)).map((f) => f.filename);
}
/* -------------------------------- */

export default function DeviceConfig() {
  const { serial } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const loggedUser = JSON.parse(localStorage.getItem("user") || "{}").username;

  // Loading & error states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // CPE data
  const [device, setDevice] = useState(null);
  const [message, setMessage] = useState("");

  /* PPPoE */
  const [pppoeUser, setPppoeUser] = useState("");
  const [pppoePass, setPppoePass] = useState("");
  const [editingUser, setEditingUser] = useState(false);
  const [editingPass, setEditingPass] = useState(false);
  const [tempUser, setTempUser] = useState("");
  const [tempPass, setTempPass] = useState("");

  /* Wi-Fi */
  const [wifiNetworks, setWifiNetworks] = useState([]);

  /* Firmware */
  const [firmwareOptions, setFirmwareOptions] = useState([]);
  const [selectedFirmware, setSelectedFirmware] = useState("");

  /* GPON Power */
  const [gponPower, setGponPower] = useState({ RXPower: "N/A", TXPower: "N/A" });

  /* MultiAP */
  const [multiAPEnabled, setMultiAPEnabled] = useState(false);
  const [originalMultiAPEnabled, setOriginalMultiAPEnabled] = useState(false);

  /* Connected devices */
  const [connectedDevices, setConnectedDevices] = useState([]);

  /* LAN / DHCP / DNS */
  const [lanIp, setLanIp] = useState("");
  const [tempLanIp, setTempLanIp] = useState("");
  const [editingLan, setEditingLan] = useState(false);

  const [dhcpMin, setDhcpMin] = useState("");
  const [dhcpMax, setDhcpMax] = useState("");
  const [originalDhcpMin, setOriginalDhcpMin] = useState("");
  const [originalDhcpMax, setOriginalDhcpMax] = useState("");
  const [tempDhcpMin, setTempDhcpMin] = useState("");
  const [tempDhcpMax, setTempDhcpMax] = useState("");
  const [editingDhcp, setEditingDhcp] = useState(false);
  const [dhcpRangeTouched, setDhcpRangeTouched] = useState(false);

  const [dnsPrimary, setDnsPrimary] = useState("");
  const [dnsSecondary, setDnsSecondary] = useState("");
  const [originalDnsPrimary, setOriginalDnsPrimary] = useState("");
  const [originalDnsSecondary, setOriginalDnsSecondary] = useState("");
  const [tempDnsPrimary, setTempDnsPrimary] = useState("");
  const [tempDnsSecondary, setTempDnsSecondary] = useState("");
  const [editingDns, setEditingDns] = useState(false);

  // ─── 1) Load CPE data with retry ──────────────────────────────────────
  useEffect(() => {
    let canceled = false;
    async function loadData(attempts = 3) {
      try {
        const { data } = await axios.get(`/devices/serial/${serial}`);
        if (canceled) return;
        setDevice(data);
        setPppoeUser(data.pppoeUsername || "");
        setPppoePass(data.pppoePassword || "");
        setWifiNetworks((data.wifiNetworks || []).filter(n => n.enable).map(n => ({
          ...n,
          editing: false,
          originalSsid: n.ssid,
          originalPass: n.passphrase,
          tempSsid: n.ssid,
          tempPass: n.passphrase,
        })));
        const mp = data.multiapEnabled === true || data.multiapEnabled === "true";
        setMultiAPEnabled(mp);
        setOriginalMultiAPEnabled(mp);
        setConnectedDevices(data.connectedDevices || []);
        setLanIp(data.lanIp || "");
        setDhcpMin(data.dhcpMin || "");
        setDhcpMax(data.dhcpMax || "");
        setOriginalDhcpMin(data.dhcpMin || "");
        setOriginalDhcpMax(data.dhcpMax || "");
        const [p, s] = (data.dnsServers || "").split(",");
        setDnsPrimary(p || "");
        setDnsSecondary(s || "");
        setOriginalDnsPrimary(p || "");
        setOriginalDnsSecondary(s || "");
        setLoading(false);
      } catch {
        if (attempts > 0) {
          setTimeout(() => loadData(attempts - 1), 2000);
        } else if (!canceled) {
          setError("Não foi possível carregar os dados da CPE.");
          setLoading(false);
        }
      }
    }
    loadData();
    return () => { canceled = true; };
  }, [serial]);

  // ─── 2) Load firmware list ────────────────────────────────────────────
  useEffect(() => {
    if (!device) return;
    axios.get(`/genieacs/files?query=${encodeURIComponent("{}")}`)
      .then(({ data }) => {
        const normalized = Array.isArray(data)
          ? data.map(item => typeof item === "string" ? { filename: item } : item)
          : [];
        setFirmwareOptions(normalized);
      })
      .catch(() => setFirmwareOptions([]));
  }, [device]);

  // ─── 3) Load GPON power for FiberHome ────────────────────────────────
  useEffect(() => {
    if (device?.manufacturer === "FiberHome") {
      axios.get(`/devices/serial/${serial}/gponpower`)
        .then(({ data }) => setGponPower(data))
        .catch(console.error);
    }
  }, [device, serial]);

  // ──────────────────────────────────────────────────────────────────────
  // Conditional UI for loading / error
  if (loading) {
    return (
      <div className="device-config-container" style={{ textAlign: "center", padding: 40 }}>
        <p style={{ fontSize: 18 }}>Carregando configurações da CPE {serial}…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="device-config-container" style={{ textAlign: "center", padding: 40 }}>
        <p style={{ fontSize: 18, color: "red" }}>{error}</p>
        <button
          className="device-config-button"
          onClick={() => {
            setError("");
            setLoading(true);
            window.location.reload();
          }}
        >
          Tentar Novamente
        </button>
        <button
          className="device-config-button"
          style={{ marginLeft: 8 }}
          onClick={() => navigate("/devices", { state: location.state })}
        >
          Voltar
        </button>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // Full UI now that `device` is loaded
  const isOnline = getDeviceStatus(device) === "online";
  const connectionType = device?.pppoeUsername?.trim() ? "PPPoE" : "IPoE";
  const availableFirmwares = getFirmwareOptionsForModel(buildModelKey(device), firmwareOptions);

  // Handlers (apply config, refresh, firmware, reboot, etc.)
  const handleEditUser = () => {
    if (hasPermission("configurePPPoe") || hasPermission("technician")) {
      setTempUser(pppoeUser);
      setEditingUser(true);
    }
  };
  const handleApplyUser = () => {
    setPppoeUser(tempUser);
    setEditingUser(false);
    setMessage("Usuário PPPoE atualizado localmente.");
  };
  const handleEditPass = () => {
    if (hasPermission("configurePPPoe") || hasPermission("technician")) {
      setTempPass(pppoePass);
      setEditingPass(true);
    }
  };
  const handleApplyPass = () => {
    setPppoePass(tempPass);
    setEditingPass(false);
    setMessage("Senha PPPoE atualizada localmente.");
  };

  const handleEditWifi = idx => {
    if (hasPermission("configureWiFi") || hasPermission("technician")) {
      setWifiNetworks(prev =>
        prev.map((n, i) => (i === idx ? { ...n, editing: true } : n))
      );
    }
  };
  const handleCancelWifi = idx => {
    setWifiNetworks(prev =>
      prev.map((n, i) =>
        i === idx
          ? { ...n, editing: false, tempSsid: n.originalSsid, tempPass: n.originalPass }
          : n
      )
    );
  };
  const handleOkWifi = idx => {
    setWifiNetworks(prev =>
      prev.map((n, i) =>
        i === idx
          ? { ...n, ssid: n.tempSsid, passphrase: n.tempPass, editing: false }
          : n
      )
    );
    setMessage("Configuração Wi-Fi atualizada localmente.");
  };

  const handleEditLan = () => {
    setTempLanIp(lanIp);
    setDhcpRangeTouched(false);
    setEditingLan(true);
  };
  const handleApplyLan = () => {
    const oldLanIp = lanIp;
    setLanIp(tempLanIp);
    setEditingLan(false);
    if (!dhcpRangeTouched) {
      const newOcts = tempLanIp.split(".");
      if (newOcts.length === 4) {
        const newPrefix = `${newOcts[0]}.${newOcts[1]}.${newOcts[2]}`;
        let newMin, newMax;
        if (originalDhcpMin && originalDhcpMax && oldLanIp) {
          const oldLanOct = parseInt(oldLanIp.split(".").pop(), 10);
          const oldMinOct = parseInt(originalDhcpMin.split(".").pop(), 10);
          const oldMaxOct = parseInt(originalDhcpMax.split(".").pop(), 10);
          const newLanOct = parseInt(newOcts[3], 10);
          newMin = `${newPrefix}.${newLanOct + (oldMinOct - oldLanOct)}`;
          newMax = `${newPrefix}.${newLanOct + (oldMaxOct - oldLanOct)}`;
        } else {
          newMin = `${newPrefix}.100`;
          newMax = `${newPrefix}.200`;
        }
        setTempDhcpMin(newMin);
        setTempDhcpMax(newMax);
        setDhcpMin(newMin);
        setDhcpMax(newMax);
      }
    }
  };

  const handleEditDhcp = () => {
    setTempDhcpMin(dhcpMin);
    setTempDhcpMax(dhcpMax);
    setEditingDhcp(true);
  };
  const handleApplyDhcp = () => {
    setDhcpMin(tempDhcpMin);
    setDhcpMax(tempDhcpMax);
    setEditingDhcp(false);
    setDhcpRangeTouched(true);
  };

  const handleEditDns = () => {
    setTempDnsPrimary(dnsPrimary);
    setTempDnsSecondary(dnsSecondary);
    setEditingDns(true);
  };
  const handleApplyDns = () => {
    if (!tempDnsPrimary && !tempDnsSecondary) {
      setDnsPrimary(lanIp);
      setDnsSecondary("");
    } else {
      setDnsPrimary(tempDnsPrimary);
      setDnsSecondary(tempDnsSecondary);
    }
    setEditingDns(false);
  };

  const handleToggleMultiAP = () => {
    if (!isOnline) {
      setMessage("Dispositivo offline. Alterações não são permitidas.");
      return;
    }
    setMultiAPEnabled(prev => !prev);
  };

  const handleApplyConfig = async () => {
    if (!isOnline) {
      setMessage("Dispositivo offline. Alterações não são permitidas.");
      return;
    }
    if (!window.confirm("Deseja aplicar TODAS as alterações na CPE?")) return;

    const lanChanged = lanIp.trim() !== device?.lanIp?.trim();
    const rangeChanged = dhcpMin.trim() !== device?.dhcpMin?.trim() || dhcpMax.trim() !== device?.dhcpMax?.trim();
    const dnsChanged = dnsPrimary.trim() !== originalDnsPrimary.trim() || dnsSecondary.trim() !== originalDnsSecondary.trim();

    setMessage("Aplicando configurações…");
    try {
      const tasks = [];

      // PPPoE
      const userChanged = connectionType === "PPPoE" &&
        (pppoeUser.trim() !== (device?.pppoeUsername || "").trim() ||
         pppoePass.trim() !== (device?.pppoePassword || "").trim());
      if (userChanged && (hasPermission("configurePPPoe") || hasPermission("technician"))) {
        tasks.push(axios.post(`/devices/serial/${serial}/setPppoe`, { user: pppoeUser, pass: pppoePass }));
      }

      // Wi-Fi
      if (hasPermission("configureWiFi") || hasPermission("technician")) {
        for (const n of wifiNetworks) {
          const ssidChanged = n.ssid.trim() !== n.originalSsid.trim();
          const passChanged = n.passphrase.trim() !== n.originalPass.trim();
          if (ssidChanged || passChanged) {
            tasks.push(
              axios.post(`/devices/serial/${serial}/setWifi`, {
                index: n.index,
                ssid: ssidChanged ? n.ssid : "",
                passphrase: passChanged ? n.passphrase : ""
              })
            );
          }
        }
      }

      // MultiAP
      if (
        device?.manufacturer === "FiberHome" &&
        ["HG6145F", "HG6145F3"].includes(device.model) &&
        multiAPEnabled !== originalMultiAPEnabled
      ) {
        tasks.push(
          axios.post(`/devices/serial/${serial}/setMultiAP`, {
            enable: multiAPEnabled
          })
        );
      }

      // LAN / DHCP / DNS
      if ((hasPermission("configureDhcp") || hasPermission("technician")) && (lanChanged || rangeChanged || dnsChanged)) {
        const payload = { gateway: lanIp, min: dhcpMin, max: dhcpMax };
        if (dnsChanged) {
          let finalPrimary = dnsPrimary;
          let finalSecondary = dnsSecondary;
          if (!dnsPrimary && !dnsSecondary) {
            finalPrimary = lanIp;
            finalSecondary = "";
          }
          payload.dnsServers = finalSecondary ? `${finalPrimary},${finalSecondary}` : finalPrimary;
        }
        tasks.push(axios.post(`/devices/serial/${serial}/setDhcp`, payload));
      }

      // Execute tasks
      await Promise.all(tasks);

      // Local state updates
      if ((hasPermission("configureDhcp") || hasPermission("technician")) && (lanChanged || rangeChanged || dnsChanged)) {
        if (lanChanged) setLanIp(tempLanIp);
        if (rangeChanged) {
          setDhcpMin(tempDhcpMin);
          setDhcpMax(tempDhcpMax);
        }
        if (dnsChanged) {
          if (!tempDnsPrimary && !tempDnsSecondary) {
            setDnsPrimary(tempLanIp);
            setDnsSecondary("");
          } else {
            setDnsPrimary(tempDnsPrimary);
            setDnsSecondary(tempDnsSecondary);
          }
          setOriginalDnsPrimary(tempDnsPrimary);
          setOriginalDnsSecondary(tempDnsSecondary);
        }
      }

      // Force a TR-069 refresh
      await axios.post(`/devices/serial/${serial}/refreshNow`);

      // Re-fetch device
      const { data: fresh } = await axios.get(`/devices/serial/${serial}`);
      setDevice(fresh);

      // Re-sync local sections
      setPppoeUser(fresh.pppoeUsername || "");
      setPppoePass(fresh.pppoePassword || "");
      setOriginalMultiAPEnabled(fresh.multiapEnabled === true || fresh.multiapEnabled === "true");
      setMultiAPEnabled(fresh.multiapEnabled === true || fresh.multiapEnabled === "true");
      setWifiNetworks(
        (fresh.wifiNetworks || []).filter(n => n.enable).map(n => ({
          ...n,
          editing: false,
          originalSsid: n.ssid,
          originalPass: n.passphrase,
          tempSsid: n.ssid,
          tempPass: n.passphrase,
        }))
      );
      setLanIp(fresh.lanIp || "");
      setDhcpMin(fresh.dhcpMin || "");
      setDhcpMax(fresh.dhcpMax || "");
      const [p2, s2] = (fresh.dnsServers || "").split(",");
      setDnsPrimary(p2 || "");
      setDnsSecondary(s2 || "");
      setOriginalDnsPrimary(p2 || "");
      setOriginalDnsSecondary(s2 || "");

      setMessage("Configurações aplicadas com sucesso!");
    } catch {
      setMessage("Erro ao aplicar configurações na CPE.");
    }
  };

  const handleApplyFirmware = async () => {
    if (!isOnline) {
      alert("Dispositivo offline. Atualização não permitida.");
      return;
    }
    if (!selectedFirmware) {
      alert("Selecione um firmware.");
      return;
    }
    if (!hasPermission("updateFirmware") && !hasPermission("technician")) {
      alert("Sem permissão para atualizar firmware.");
      return;
    }
    if (!window.confirm("Deseja realmente atualizar o firmware agora?")) return;
    try {
      const up = await fetch(`/devices/serial/${serial}/upgradeFirmware`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: selectedFirmware }),
      });
      if (!up.ok) {
        setMessage("Erro ao criar tarefa de firmware.");
        axios.post("/reports/firmware-updates", {
          serial,
          fileName: selectedFirmware,
          timestamp: new Date().toISOString(),
          status: "failure",
          error: `task creation failed (${up.status})`,
          user: loggedUser,
        }).catch(console.error);
        return;
      }
      setMessage("Atualização de firmware em andamento…");
      setTimeout(() => {
        fetch(`/devices/serial/${serial}/refreshNow`, { method: "POST" }).catch(console.error);
      }, 3000);
    } catch {
      setMessage("Erro ao iniciar atualização de firmware.");
    }
  };

  const handleReboot = () => {
    if (!isOnline) {
      setMessage("Dispositivo offline. Reinicialização não permitida.");
      return;
    }
    if (!hasPermission("rebootCPE") && !hasPermission("technician")) {
      setMessage("Sem permissão para reiniciar.");
      return;
    }
    if (!window.confirm("Deseja reiniciar a CPE?")) return;
    fetch(`/devices/serial/${serial}/reboot`, { method: "POST" })
      .then(r => {
        if (!r.ok) throw new Error();
        setMessage("Comando de reboot enviado!");
      })
      .catch(() => setMessage("Falha ao enviar comando de reboot."));
  };

  const handleFactoryReset = () => {
    if (!isOnline) {
      setMessage("Dispositivo offline. Factory reset não permitido.");
      return;
    }
    if (!hasPermission("factoryResetCPE") && !hasPermission("technician")) {
      setMessage("Sem permissão para factory reset.");
      return;
    }
    if (!window.confirm("Deseja redefinir a CPE para configurações de fábrica?")) return;
    fetch(`/devices/serial/${serial}/factoryReset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
      .then(r => {
        if (!r.ok) throw new Error();
        setMessage("Comando de factory reset enviado!");
      })
      .catch(() => setMessage("Falha ao enviar comando de factory reset."));
  };

  // ──────────────────────────────────────────────────────────────────────
  return (
    <div className="device-config-container">
      <h2 className="device-config-header">Configuração da CPE {serial}</h2>
      {!isOnline && (
        <p style={{ color: "red", fontWeight: "bold" }}>
          Dispositivo offline – alterações não são permitidas.
        </p>
      )}

      <div className="device-config-details">
        <p><strong>Serial:</strong> {serial}</p>
        <p><strong>Fabricante:</strong> {device?.manufacturer || "N/A"}</p>
        <p><strong>Modelo:</strong> {device?.model || "N/A"}</p>
        <p><strong>Versão de Firmware:</strong> {device?.softwareVersion || "N/A"}</p>
        <p><strong>Versão de Hardware:</strong> {device?.hardwareVersion || "N/A"}</p>
        <p>
          <strong>IP Externo:</strong>{" "}
          {isOnline && device?.externalIP && device.externalIP !== "N/A" ? (
            <a
              href={`http://${device.externalIP}${device.manufacturer === "FiberHome" ? "" : ":8888"}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {device.externalIP}
            </a>
          ) : "N/A"}
        </p>
        <p>
          <strong>IP LAN:</strong>{" "}
          {isOnline && device?.lanIp && device.lanIp !== "N/A" ? (
            <a href={`http://${device.lanIp}`} target="_blank" rel="noopener noreferrer">
              {device.lanIp}
            </a>
          ) : device?.lanIp ?? "N/A"}
        </p>
        <p><strong>DNS:</strong> {device?.dnsServers || "N/A"}</p>
        <p><strong>MAC de conexão:</strong> {formatMacAddress(device?.connectionMac || "N/A")}</p>
        <p><strong>Uptime:</strong> {isOnline ? formatUpTime(device?.deviceUpTime || 0) : "-"}</p>
        <p><strong>Status:</strong> {getDeviceStatus(device)}</p>
        {device?.manufacturer === "FiberHome" && (
          <>
            <p><strong>RX Power:</strong> {gponPower.RXPower}</p>
            <p><strong>TX Power:</strong> {gponPower.TXPower}</p>
          </>
        )}
      </div>

      {isOnline && connectionType === "PPPoE" && (
        <div className="pppoe-section">
          {editingUser ? (
            <>
              <label>
                <strong>Usuário PPPoE:</strong>
                <input value={tempUser} onChange={e => setTempUser(e.target.value)} />
              </label>
              <button className="device-config-button" onClick={handleApplyUser}>OK</button>
              <button className="device-config-button" onClick={() => setEditingUser(false)}>Cancelar</button>
            </>
          ) : (
            <p>
              <strong>Usuário PPPoE:</strong> {pppoeUser || "N/A"}{" "}
              {(hasPermission("configurePPPoe") ||
              hasPermission("technician")) && <span style={{ marginLeft: 6, cursor: "pointer", color: "blue" }} onClick={handleEditUser} title="Editar">&#9998;</span>}
            </p>
          )}
          {editingPass ? (
            <>
              <label>
                <strong>Senha PPPoE:</strong>
                <input value={tempPass} onChange={e => setTempPass(e.target.value)} />
              </label>
              <button className="device-config-button" onClick={handleApplyPass}>OK</button>
              <button className="device-config-button" onClick={() => setEditingPass(false)}>Cancelar</button>
            </>
          ) : (
            <p>
              <strong>Senha PPPoE:</strong> {pppoePass || "N/A"}{" "}
              {(hasPermission("configurePPPoe") ||
              hasPermission("technician")) && <span style={{ marginLeft: 6, cursor: "pointer", color: "blue" }} onClick={handleEditPass} title="Editar">&#9998;</span>}
            </p>
          )}
        </div>
      )}

      <div className="wifi-section">
        <h3>Redes Wi-Fi Ativas</h3>
        {wifiNetworks.length === 0 && <p>Nenhuma rede ativa encontrada.</p>}
        {wifiNetworks.map((net, idx) => (
          <div key={net.index} className="wifi-card">
            {net.editing ? (
              <>
                <div className="wifi-edit-row">
                  <label>
                    <strong>SSID:</strong>
                    <input
                      value={net.tempSsid}
                      onChange={e =>
                        setWifiNetworks(prev =>
                          prev.map((n, i) => (i === idx ? { ...n, tempSsid: e.target.value } : n))
                        )
                      }
                    />
                  </label>
                  <label>
                    <strong>Senha:</strong>
                    <input
                      value={net.tempPass}
                      onChange={e =>
                        setWifiNetworks(prev =>
                          prev.map((n, i) => (i === idx ? { ...n, tempPass: e.target.value } : n))
                        )
                      }
                    />
                  </label>
                </div>
                <p><strong>Status:</strong> {net.enable ? "Ativa" : "Inativa"}</p>
                <button className="device-config-button" onClick={() => handleOkWifi(idx)}>OK</button>
                <button className="device-config-button" onClick={() => handleCancelWifi(idx)}>Cancelar</button>
              </>
            ) : (
              <>
                <p><strong>SSID:</strong> {net.ssid}</p>
                <p><strong>Senha:</strong> {net.passphrase}</p>
                <p><strong>Status:</strong> {net.enable ? "Ativa" : "Inativa"}</p>
                {(hasPermission("configureWiFi") ||
                hasPermission("technician")) && (
                  <button className="device-config-button" onClick={() => handleEditWifi(idx)}>Editar</button>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {isOnline && (hasPermission("configureNetwork") ||
      hasPermission("technician")) && (
        <div className="lan-dhcp-dns-section">
          <h3>LAN / DHCP / DNS</h3>

          <div className="field-row">
            <label className="field-label">IP de LAN:</label>
            {editingLan ? (
              <>
                <input className="field-input lan-input" value={tempLanIp} onChange={e => setTempLanIp(e.target.value)} />
                <button className="field-btn apply-btn" onClick={handleApplyLan}>OK</button>
                <button className="field-btn cancel-btn" onClick={() => setEditingLan(false)}>Cancelar</button>
              </>
            ) : (
              <>
                <span className="field-value lan-value">{lanIp}</span>
                <span className="edit-icon" onClick={handleEditLan}>&#9998;</span>
              </>
            )}
          </div>

          <div className="field-row">
            <label className="field-label">DHCP:</label>
            {editingDhcp ? (
              <>
                <input className="field-input dhcp-input" value={tempDhcpMin} onChange={e => { setTempDhcpMin(e.target.value); setDhcpRangeTouched(true); }} placeholder="Início" />
                <span className="range-separator">–</span>
                <input className="field-input dhcp-input" value={tempDhcpMax} onChange={e => { setTempDhcpMax(e.target.value); setDhcpRangeTouched(true); }} placeholder="Fim" />
                <button className="field-btn apply-btn" onClick={handleApplyDhcp}>OK</button>
                <button className="field-btn cancel-btn" onClick={() => setEditingDhcp(false)}>Cancelar</button>
              </>
            ) : (
              <>
                <span className="field-value dhcp-value">{dhcpMin} – {dhcpMax}</span>
                <span className="edit-icon" onClick={handleEditDhcp}>&#9998;</span>
              </>
            )}
          </div>

          <div className="field-row">
            <label className="field-label">DNS:</label>
            {editingDns ? (
              <>
                <input className="field-input dns-input" value={tempDnsPrimary} onChange={e => setTempDnsPrimary(e.target.value)} placeholder="Primário" />
                <span className="range-separator">,</span>
                <input className="field-input dns-input" value={tempDnsSecondary} onChange={e => setTempDnsSecondary(e.target.value)} placeholder="Secundário" />
                <button className="field-btn apply-btn" onClick={handleApplyDns}>OK</button>
                <button className="field-btn cancel-btn" onClick={() => setEditingDns(false)}>Cancelar</button>
              </>
            ) : (
              <>
                <span className="field-value dns-value">{dnsPrimary}, {dnsSecondary}</span>
                <span className="edit-icon" onClick={handleEditDns}>&#9998;</span>
              </>
            )}
          </div>
        </div>
      )}

      {device?.manufacturer === "FiberHome" &&
        ["HG6145F", "HG6145F3"].includes(device.model) &&
        (hasPermission("setMultiAP") || hasPermission("technician")) && (
          <div className="multiap-section">
            <h3>Configuração MultiAP</h3>
            <label className="switch">
              <input type="checkbox" checked={multiAPEnabled} onChange={handleToggleMultiAP} disabled={!isOnline} />
              <span className="slider" />
            </label>
          </div>
        )}

      <div className="firmware-update-section">
        <h3>Atualização de Firmware</h3>
        {!isOnline ? (
          <p>Dispositivo offline. Atualização de firmware não é permitida.</p>
        ) : firmwareOptions.length === 0 ? (
          <p>Carregando firmwares disponíveis...</p>
        ) : availableFirmwares.length === 0 ? (
          <p>Nenhum firmware compatível para este modelo.</p>
        ) : (
          <div className="firmware-container">
            <label className="firmware-label">Firmware Disponível:</label>
            <select className="firmware-select" value={selectedFirmware} onChange={e => setSelectedFirmware(e.target.value)}>
              <option value="">Selecione</option>
              {availableFirmwares.map(fw => (
                <option key={fw} value={fw}>{fw}</option>
              ))}
            </select>
            {(hasPermission("updateFirmware") || hasPermission("technician")) && (
              <button className="device-config-button firmware-button" onClick={handleApplyFirmware}>
                Aplicar Firmware
              </button>
            )}
          </div>
        )}
      </div>

      <div className="connected-devices">
        <h3>Dispositivos Conectados</h3>
        {connectedDevices.length > 0 ? (
          <table className="connected-table">
            <thead>
              <tr>
                <th>Hostname</th>
                <th>MAC</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {connectedDevices.map((d, i) => (
                <tr key={i}>
                  <td>{d.hostname !== "N/A" ? d.hostname : ""}</td>
                  <td>{d.mac !== "N/A" ? formatMacAddress(d.mac) : ""}</td>
                  <td>{d.ip !== "N/A" ? d.ip : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p>Nenhum dispositivo conectado encontrado.</p>}
      </div>

      <div className="buttons-row">
        {isOnline && (
          <>
            {(hasPermission("configurePPPoe") ||
              hasPermission("configureWiFi") ||
              hasPermission("updateFirmware") ||
              hasPermission("configureNetwork") ||
              hasPermission("technician") ||
              hasPermission("setMultiAP")) && (
              <button className="device-config-button" onClick={handleApplyConfig}>
                Aplicar Config
              </button>
            )}
            {(hasPermission("rebootCPE") || hasPermission("technician")) && (
              <button className="device-config-button" onClick={handleReboot}>
                Reiniciar CPE
              </button>
            )}
            {(hasPermission("factoryResetCPE") || hasPermission("technician")) && (
              <button className="device-config-button" onClick={handleFactoryReset}>
                Redefinir Fábrica
              </button>
            )}
          </>
        )}
        <button className="device-config-button" onClick={() => navigate("/admin/reset-events", { state: location.state })}>
          Voltar ao Dashboard
        </button>
      </div>

      {message && (
        <p className="device-config-message" style={{ marginTop: 15, fontWeight: "bold", color: "green" }}>
          {message}
        </p>
      )}
    </div>
  );
}
