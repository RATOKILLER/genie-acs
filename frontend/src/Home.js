// src/Home.js

import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { Link, useLocation } from "react-router-dom";
import refreshIcon from "./img/refresh.png";
import "./App.css";
import { hasPermission } from "./permissions";

/** Formata MAC (ex.: "AABBCCDDEEFF" => "AA:BB:CC:DD:EE:FF") */
function formatMacAddress(serial) {
  const cleaned = serial.replace(/[^a-fA-F0-9]/g, "");
  if (cleaned.length === 12 && /^[A-Fa-f0-9]+$/.test(cleaned)) {
    return cleaned.match(/.{2}/g).join(":").toUpperCase();
  }
  return serial;
}

/** Remove prefixos de mesh e padroniza */
function removePrincipalSerial(status) {
  if (status.startsWith("Em Mesh com:")) return "Em Mesh";
  if (status.startsWith("Conectado via LAN em:")) return "Principal";
  if (status === "PRINCIPAL") return "Principal";
  return status;
}

/** Verifica se é secundário */
function isSecondary(dev) {
  const s = dev.meshStatus || "";
  return s.startsWith("Em Mesh") || s.startsWith("Conectado via LAN");
}

/** Verifica se principal tem secundários */
function hasMeshOrLanSecondaries(dev, allDevices) {
  return allDevices.some(
    (sec) =>
      sec.principalSerial === dev.serial &&
      sec.serial !== dev.serial &&
      (sec.meshStatus?.startsWith("Em Mesh") ||
        sec.meshStatus?.startsWith("Conectado via LAN"))
  );
}

/** PPPoE vs IPoE */
function getConnectionType(device) {
  return device.pppoeUsername && device.pppoeUsername.trim() !== ""
    ? "PPPoE"
    : "IPoE";
}

/** Extrai versão curta de hw */
function shortVersionGeneric(hw) {
  if (!hw) return "";
  let m = hw.match(/v\s*(\d+(\.\d+)?)/i) || hw.match(/(\d+(\.\d+)?)/);
  return m ? "v" + m[1] : "";
}

/** Gera chave para agrupar firmwares */
function buildModelKey(dev) {
  const mfg = dev.manufacturer?.toUpperCase() || "";
  const mdl = dev.model?.toUpperCase().trim() || "";
  const hw = dev.hardwareVersion?.trim() || "";
  if (mdl.includes("ARCHER C5")) return "";
  if (mfg === "FIBERHOME") return mdl;
  if (mdl.includes("ARCHER C20")) {
    const v = hw.match(/v\s*(\d+)/i);
    return v ? `ARCHER_C20_V${v[1]}` : "ARCHER_C20";
  }
  if (
    mfg === "MERCUSYS" &&
    (mdl === "MR30G" || mdl === "MR60X")
  ) {
    let h = hw.toUpperCase().replace(mdl, "").trim() || "1.0";
    return `${mdl}_V${h.split(".")[0]}`;
  }
  const part = hw.toUpperCase().replace(/\s+/g, "_");
  return part ? `${mdl}_${part}` : mdl;
}

/** Label compacto para modal massa */
function getModelLabel(dev) {
  const mfg = dev.manufacturer?.toUpperCase() || "";
  const mdl = dev.model || "";
  const hw = dev.hardwareVersion || "";
  if (mfg === "FIBERHOME") return mdl;
  if (
    mfg === "MERCUSYS" &&
    (mdl.toUpperCase() === "MR30G" || mdl.toUpperCase() === "MR60X")
  ) {
    const sv = shortVersionGeneric(
      hw.replace(new RegExp(mdl, "i"), "").trim()
    );
    return sv ? `${mdl} ${sv}` : mdl;
  }
  if (mdl.toUpperCase().includes("ARCHER C20")) {
    const sv = shortVersionGeneric(hw);
    return sv ? `${mdl} ${sv}` : mdl;
  }
  const sv = shortVersionGeneric(hw);
  return sv ? `${mdl} ${sv}`.trim() : mdl;
}

/** Filtra firmwares por chave */
function getFirmwareOptionsForModel(key, list) {
  if (!key) return [];
  const esc = key.replace(/\./g, "\\.");
  const re = new RegExp(`^${esc}.*\\.bin$`, "i");
  return list.filter((f) => re.test(f.filename));
}

/** Online / Offline */
function getDeviceStatus(dev) {
  return dev.status?.toLowerCase() === "online" ? "online" : "offline";
}

/** Uptime sem segundos */
function formatUpTimeNoSeconds(sec) {
  if (!sec || isNaN(sec)) return "N/A";
  const d = Math.floor(sec / 86400),
    h = Math.floor((sec % 86400) / 3600),
    m = Math.floor((sec % 3600) / 60);
  return d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m`;
}

const Home = () => {
   const user = JSON.parse(localStorage.getItem("user") || "{}");
   const location = useLocation();
  // se vier de volta da página de detalhes, recupera filtros e paginação+  
   const prev = location.state || {};

  // filtros e pesquisa (não persistem entre sessões)
   const [showFilt, setShowFilt] = useState(prev.showFilt || false);
   const [fMfg, setFMfg] = useState(prev.fMfg || "");
   const [fModel, setFModel] = useState(prev.fModel || "");
   const [fVer, setFVer] = useState(prev.fVer || "");
   const [fConn, setFConn] = useState(prev.fConn || "");
   const [fMesh, setFMesh] = useState(prev.fMesh || "");
   const [search, setSearch] = useState(prev.search || "");

  // filtro de status Online/Offline
  const [statusFilter, setStatusFilter] = useState(prev.statusFilter || "all"); // all | online | offline

  // paginação dinâmica
  const [pageSize, setPageSize] = useState(prev.pageSize || 50);
  const [page, setPage] = useState(prev.page || 1);

  // estados principais
  const [devices, setDevices] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [refreshing, setRefreshing] = useState({});
  const [massMode, setMassMode] = useState(false);
  const [selForUp, setSelForUp] = useState({});
  const [modelMap, setModelMap] = useState({});
  const [showModal, setShowModal] = useState(false);
  const [firmwares, setFirmwares] = useState([]);

  // ** NOVO: modo de remoção **
  const [removeMode, setRemoveMode] = useState(false);
  const [selectedToRemove, setSelectedToRemove] = useState({});
  const removeLimit = Infinity; // sem limite de seleção

  const massLimit =
    parseInt(localStorage.getItem("massUpdateLimit"), 10) || 50;

  // busca inicial
  useEffect(() => {
    axios
      .get("/devices")
      .then((r) => {
       // remove todas as CPEs recém-resetadas (pppoeUsername === 'reset')
       const sóComConfig = r.data.filter(
         (d) => (d.pppoeUsername || "").toLowerCase() !== "reset"
       );
       setDevices(sóComConfig);
     })
      .catch(console.error);
    axios
      .get(`/genieacs/files?query=${encodeURIComponent("{}")}`)
      .then((r) => setFirmwares(r.data))
      .catch(console.error);
  }, []);

  // filtros resetam página
  useEffect(() => {
    setPage(1);
  }, [fMfg, fModel, fVer, fConn, fMesh, search, statusFilter]);

  // filtragem aplicada
  const main = useMemo(() => devices.filter((d) => !isSecondary(d)), [
    devices,
  ]);
  const byMfg = useMemo(
    () =>
      fMfg
        ? main.filter(
            (d) =>
              d.manufacturer.toLowerCase().trim() === fMfg
                .toLowerCase()
                .trim()
          )
        : main,
    [main, fMfg]
  );
  const uniqueMfg = useMemo(
    () => [...new Set(main.map((d) => d.manufacturer))].sort(),
    [main]
  );
  const uniqueMod = useMemo(
    () => [...new Set(byMfg.map((d) => d.model))].sort(),
    [byMfg]
  );
  const byMfgModel = useMemo(
    () =>
      fModel
        ? byMfg.filter(
            (d) =>
              d.model.toLowerCase().trim() === fModel.toLowerCase().trim()
          )
        : byMfg,
    [byMfg, fModel]
  );
  const uniqueVer = useMemo(
    () => [...new Set(byMfgModel.map((d) => d.softwareVersion))].sort(),
    [byMfgModel]
  );

  const filtered = useMemo(() => {
    let b = byMfgModel;
    if (fVer) {
      b = b.filter(
        (d) =>
          d.softwareVersion.toLowerCase().trim() ===
          fVer.toLowerCase().trim()
      );
    }
    if (fConn) {
      b = b.filter((d) => getConnectionType(d) === fConn);
    }
    if (fMesh) {
      b = b.filter((d) => {
        const cm = removePrincipalSerial(d.meshStatus || "")
          .toLowerCase()
          .trim();
        if (fMesh === "mesh")
          return ["em mesh", "conectado via lan", "mesh"].includes(cm);
        if (fMesh === "principal") return cm === "principal";
        if (fMesh === "---") return cm === "";
        return true;
      });
    }
    if (statusFilter !== "all") {
      b = b.filter(
        (d) => getDeviceStatus(d) === statusFilter
      );
    }
    if (search) {
      const sl = search.toLowerCase();
      b = b.filter((d) => {
        const sc = (d.serial || "")
          .replace(/[^a-zA-Z0-9]/g, "")
          .toLowerCase();
        const mc = (d.connectionMac || "")
          .replace(/[^a-fA-F0-9]/g, "")
          .toLowerCase();
        return (
          sc.includes(sl) ||
          mc.includes(sl) ||
          d.manufacturer.toLowerCase().includes(sl) ||
          d.model.toLowerCase().includes(sl) ||
          d.pppoeUsername.toLowerCase().includes(sl) ||
          d.externalIP.toLowerCase().includes(sl)
        );
      });
    }
    return b;
  }, [
    byMfgModel,
    fVer,
    fConn,
    fMesh,
    statusFilter,
    search,
  ]);

  // paginação
  const totalPages = Math.ceil(filtered.length / pageSize);
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  const visible = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize]
  );

  // seleção massiva atualização
  const allSel = useMemo(() => {
    const firstN = filtered.slice(0, massLimit);
    return (
      firstN.length > 0 &&
      firstN.every((d) => selForUp[d.serial])
    );
  }, [filtered, selForUp]);

  // seleção para remoção
  const allRemoveSel = useMemo(() => {
    const first = visible;
    return (
      first.length > 0 &&
      first.every((d) => selectedToRemove[d.serial])
    );
  }, [visible, selectedToRemove]);

  // handlers de UI
  const toggle = (s) =>
    setExpanded((p) => ({ ...p, [s]: !p[s] }));
  const onCheck = (s, v, e) => {
    e.stopPropagation();
    const cnt = Object.values(selForUp).filter(Boolean).length;
    if (v && cnt >= massLimit) {
      alert(`Limite de ${massLimit} atingido!`);
      return;
    }
    setSelForUp((p) => ({ ...p, [s]: v }));
  };
  const onSelectAll = (e) => {
    const v = e.target.checked;
    const firstN = filtered.slice(0, massLimit);
    setSelForUp(
      firstN.reduce((acc, d) => ({ ...acc, [d.serial]: v }), selForUp)
    );
  };

  const onRemoveCheck = (s, v, e) => {
    e.stopPropagation();
    setSelectedToRemove((p) => ({ ...p, [s]: v }));
  };
  const onRemoveSelectAll = (e) => {
    const v = e.target.checked;
    const first = visible;
    setSelectedToRemove(
      first.reduce((acc, d) => ({ ...acc, [d.serial]: v }), selectedToRemove)
    );
  };

  const startMass = () => {
    setMassMode(true);
    setRemoveMode(false);
  };
  const cancelMass = () => {
    setMassMode(false);
    setSelForUp({});
    setModelMap({});
  };
  const openModal = () => {
    if (!Object.values(selForUp).some(Boolean)) {
      alert("Nenhuma CPE selecionada!");
      return;
    }
    const map = {};
    filtered.forEach((d) => {
      if (selForUp[d.serial]) {
        const key = buildModelKey(d);
        if (!key) return;
        if (!map[key]) map[key] = { label: getModelLabel(d), firmware: "" };
      }
    });
    setModelMap(map);
    setShowModal(true);
  };

  const confirmModal = async () => {
    if (!window.confirm("Deseja realmente atualizar firmware em massa?"))
      return;
    cancelMass();
    setShowModal(false);
    alert("Atualizações em massa enviadas!");
    // ... (lógica de envio em massa omitida para brevidade)
  };

  const handleRefresh = (d, e) => {
    e.stopPropagation();
    setRefreshing((p) => ({ ...p, [d.serial]: true }));
    fetch(`/devices/serial/${d.serial}/refreshNow`, {
      method: "POST",
    })
      .then(() => axios.get("/devices"))
      .then((r) => {
        setDevices(r.data);
        setRefreshing((p) => ({ ...p, [d.serial]: false }));
      })
      .catch(() => setRefreshing((p) => ({ ...p, [d.serial]: false })));
  };

  // ** NOVO: confirmar remoção **
  const confirmRemoval = async () => {
    const toRemove = Object.entries(selectedToRemove)
      .filter(([_, v]) => v)
      .map(([s]) => s);
    if (toRemove.length === 0) return;
    if (!window.confirm("Deseja realmente remover as CPEs selecionadas?"))
      return;
    try {
      await Promise.all(
        toRemove.map((serial) =>
          axios.delete(`/devices/serial/${encodeURIComponent(serial)}`)
        )
      );
      // recarrega
      const r = await axios.get("/devices");
      setDevices(r.data);
      // limpa seleção
      setSelectedToRemove({});
      setRemoveMode(false);
    } catch (err) {
      console.error(err);
      alert("Erro ao remover uma ou mais CPEs");
    }
  };

  const cancelRemoval = () => {
    setRemoveMode(false);
    setSelectedToRemove({});
  };

  return (
    <div className="dashboard-container">
      {/* Voltar */}
      <div style={{ textAlign: "right", margin: 20 }}>
        <Link to="/" className="device-config-button">
          Voltar para a Página Inicial
        </Link>
      </div>

      <h2 className="dashboard-title">Dashboard de CPEs</h2>

      {/* Controles */}
      <div className="controls-container">
        {!massMode && !removeMode ? (
          <>
            <button
              className="device-config-button"
              onClick={() => setShowFilt(!showFilt)}
            >
              {showFilt ? "Ocultar Filtros" : "Exibir Filtros"}
            </button>
            <input
              type="text"
              className="search-box"
              placeholder="Pesquisar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {hasPermission("massFirmwareUpdate") &&
              user.roles === "admin" && (
                <button
                  className="device-config-button"
                  onClick={startMass}
                >
                  Atualizar Firmware em Massa
                </button>
              )}
            {user.roles === "admin" && (
              <button
                className="device-config-button"
                style={{ backgroundColor: "#dc3545", marginLeft: 10 }}
                onClick={() => {
                  setRemoveMode(true);
                  setMassMode(false);
                }}
              >
                Remover CPE(s)
              </button>
            )}
          </>
        ) : massMode ? (
          <>
            <button
              className="device-config-button"
              style={{ backgroundColor: "#28a745" }}
              onClick={openModal}
            >
              Iniciar Atualização
            </button>
            <button
              className="device-config-button"
              style={{
                backgroundColor: "#dc3545",
                marginLeft: 10,
              }}
              onClick={cancelMass}
            >
              Cancelar
            </button>
          </>
        ) : (
          <>
            <button
              className="device-config-button"
              style={{ backgroundColor: "#28a745" }}
              onClick={confirmRemoval}
            >
              Confirmar Remoção
            </button>
            <button
              className="device-config-button"
              style={{
                backgroundColor: "#6c757d",
                marginLeft: 10,
              }}
              onClick={cancelRemoval}
            >
              Cancelar
            </button>
          </>
        )}

        <div className="page-size-container">
          <span className="page-size-label">Exibir</span>
          <select
            className="page-size-select"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
          >
            {[50, 100, 500, 1000, 5000, 10000].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        <div className="total-count">
          Total de Dispositivos: {filtered.length}
        </div>
      </div>

      {/* Filtros */}
      {showFilt && (
  <div className="filters-container">
    <div className="filter-row">
      <div className="filter-item">
        <label>Fabricante:</label>
        <select
          value={fMfg}
          onChange={(e) => {
            setFMfg(e.target.value);
            setFModel("");
            setFVer("");
          }}
        >
          <option value="">-- Selecione --</option>
          {uniqueMfg.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      <div className="filter-item">
        <label>Modelo:</label>
        <select
          value={fModel}
          onChange={(e) => {
            setFModel(e.target.value);
            setFVer("");
          }}
        >
          <option value="">-- Selecione --</option>
          {uniqueMod.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      <div className="filter-item">
        <label>Versão:</label>
        <select value={fVer} onChange={(e) => setFVer(e.target.value)}>
          <option value="">-- Selecione --</option>
          {uniqueVer.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <div className="filter-item">
        <label>Conexão:</label>
        <select value={fConn} onChange={(e) => setFConn(e.target.value)}>
          <option value="">-- Selecione --</option>
          <option value="PPPoE">PPPoE</option>
          <option value="IPoE">IPoE</option>
        </select>
      </div>
      <div className="filter-item">
        <label>Mesh status:</label>
        <select value={fMesh} onChange={(e) => setFMesh(e.target.value)}>
          <option value="">-- Selecione --</option>
          <option value="mesh">Mesh</option>
          <option value="principal">Principal</option>
          <option value="---">---</option>
        </select>
      </div>
      <div className="filter-item">
        <label>Status:</label>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">Todos</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
        </select>
      </div>
    </div>
  </div>
)}


      {/* Tabela */}
      <table className="dashboard-table">
        <thead>
          <tr>
            {(massMode || removeMode) && (
              <th>
                <input
                  type="checkbox"
                  checked={
                    massMode ? allSel : removeMode ? allRemoveSel : false
                  }
                  onChange={
                    massMode ? onSelectAll : removeMode ? onRemoveSelectAll : undefined
                  }
                />
              </th>
            )}
            <th>FABRICANTE</th>
            <th>MODELO</th>
            <th>VERSÃO SOFTWARE</th>
            <th>UPTIME</th>
            <th>SERIAL</th>
            <th>MAC de conexão</th>
            <th>IP EXTERNO</th>
            <th>USUÁRIO PPPoE</th>
            <th>MESH</th>
            <th>DETALHES</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((d) => {
            const st = getDeviceStatus(d);
            const ms = d.meshStatus || "";
            const explicit =
              ms === "MESH" ||
              ms.startsWith("Em Mesh com:") ||
              ms.startsWith("Conectado via LAN em:");
            const principal = ms === "" || ms === "PRINCIPAL";
            const arrowable =
              explicit ||
              (principal && hasMeshOrLanSecondaries(d, devices));

            return (
              <React.Fragment key={d.serial}>
                <tr
                  style={{ cursor: arrowable ? "pointer" : "default" }}
                  onClick={() => arrowable && toggle(d.serial)}
                >
                  {(massMode || removeMode) && (
                    <td>
                      <input
                        type="checkbox"
                        checked={
                          massMode
                            ? selForUp[d.serial] || false
                            : removeMode
                            ? selectedToRemove[d.serial] || false
                            : false
                        }
                        onChange={(e) =>
                          massMode
                            ? onCheck(d.serial, e.target.checked, e)
                            : removeMode
                            ? onRemoveCheck(d.serial, e.target.checked, e)
                            : undefined
                        }
                        style={{ transform: "scale(1.2)", marginRight: 8 }}
                      />
                    </td>
                  )}
                  <td className="manufacturer-cell">
                    <button
                      className="device-config-button"
                      onClick={(e) => handleRefresh(d, e)}
                      style={{
                        marginRight: 8,
                        padding: 0,
                        background: "none",
                        border: "none",
                      }}
                      title="Refresh CPE"
                    >
                      <img
                        src={refreshIcon}
                        alt="Refresh"
                        className={refreshing[d.serial] ? "rotate" : ""}
                        style={{ width: 20, height: 20 }}
                      />
                    </button>
                    <span
                      className={`status-indicator ${st}`}
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: "50%",
                        display: "inline-block",
                        marginRight: 5,
                      }}
                    />
                    {d.manufacturer}{" "}
                    {arrowable && (
                      <span className="arrow">
                        {expanded[d.serial] ? "▲" : "▼"}
                      </span>
                    )}
                  </td>
                  <td>{d.model}</td>
                  <td>{d.softwareVersion}</td>
                  <td>
                    {st === "online"
                      ? formatUpTimeNoSeconds(d.deviceUpTime)
                      : "-"}
                  </td>
                  <td>{formatMacAddress(d.serial)}</td>
                  <td>{formatMacAddress(d.connectionMac)}</td>
                  <td>
                    {st === "online" && d.externalIP !== "N/A" ? (
                      <a
                        href={`http://${d.externalIP}${
                          d.manufacturer === "FiberHome" ? "" : ":8888"
                        }`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {d.externalIP}
                      </a>
                    ) : (
                      "N/A"
                    )}
                  </td>
                  <td>{d.pppoeUsername || "N/A"}</td>
                  <td style={{ color: "red" }}>
                    {removePrincipalSerial(d.meshStatus || "")}
                  </td>
                  <td>
                    {d.deviceId ? (
                      <Link
                        to={`/devices/${d.serial}`}
                        state={{
                          fMfg,
                          fModel,
                          fVer,
                          fConn,
                          fMesh,
                          search,
                          page,
                          pageSize,
                        }}
                      >
                        <button>Detalhes</button>
                      </Link>
                    ) : (
                      <span>--</span>
                    )}
                  </td>
                </tr>

                {expanded[d.serial] &&
                  devices
                    .filter(
                      (sec) =>
                        sec.principalSerial === d.serial &&
                        sec.serial !== d.serial &&
                        (sec.meshStatus?.startsWith("Em Mesh") ||
                          sec.meshStatus?.startsWith("Conectado via LAN"))
                    )
                    .map((sec) => (
                      <tr key={sec.serial} className="submenu">
                        {(massMode || removeMode) && <td />}
                        <td style={{ paddingLeft: 55 }}>
                          {sec.manufacturer}
                        </td>
                        <td>{sec.model}</td>
                        <td>{sec.softwareVersion}</td>
                        <td>
                          {sec.deviceUpTime
                            ? formatUpTimeNoSeconds(sec.deviceUpTime)
                            : "N/A"}
                        </td>
                        <td>{formatMacAddress(sec.serial)}</td>
                        <td>{formatMacAddress(sec.connectionMac || "N/A")}</td>
                        <td>
                          {getDeviceStatus(sec) === "online" &&
                          sec.externalIP !== "N/A" ? (
                            <a
                              href={`http://${sec.externalIP}${
                                sec.manufacturer === "FiberHome"
                                  ? ""
                                  : ":8888"
                              }`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {sec.externalIP}
                            </a>
                          ) : (
                            "N/A"
                          )}
                        </td>
                        <td>{sec.pppoeUsername || "N/A"}</td>
                        <td style={{ color: "red" }}>
                          {removePrincipalSerial(sec.meshStatus || "")}
                        </td>
                        <td>
                          {sec.deviceId ? (
                            <Link
                              to={`/devices/${sec.serial}`}
                              state={{
                                fMfg,
                                fModel,
                                fVer,
                                fConn,
                                fMesh,
                                search,
                                page,
                                pageSize,
                              }}
                            >
                              <button>Detalhes</button>
                            </Link>
                          ) : (
                            <span>--</span>
                          )}
                        </td>
                      </tr>
                    ))}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>

      {/* Paginação numérica */}
      {totalPages > 1 && (
        <div
          className="pagination"
          style={{ textAlign: "center", margin: "20px 0" }}
        >
          <button
            className="device-config-button"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            style={{ marginRight: 8 }}
          >
            « Anterior
          </button>

          {pages.map((p) => (
            <button
              key={p}
              className="device-config-button"
              onClick={() => setPage(p)}
              style={{
                margin: "0 4px",
                fontWeight: p === page ? "bold" : "normal",
                backgroundColor: p === page ? "#003366" : undefined,
              }}
            >
              {p}
            </button>
          ))}

          <button
            className="device-config-button"
            disabled={page === totalPages}
            onClick={() => setPage((p) => p + 1)}
            style={{ marginLeft: 8 }}
          >
            Próxima »
          </button>
        </div>
      )}

      {/* Modal de seleção de firmwares */}
      {showModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h3>Selecione firmware por modelo</h3>
            {Object.entries(modelMap).map(([k, v]) => (
              <div className="firmware-model-row" key={k}>
                <strong>{v.label}</strong>
                <select
                  value={v.firmware}
                  onChange={(e) =>
                    setModelMap((p) => ({
                      ...p,
                      [k]: { ...p[k], firmware: e.target.value },
                    }))
                  }
                  className="firmware-select"
                >
                  <option value="">Selecione</option>
                  {getFirmwareOptionsForModel(k, firmwares).map(
                    (fw) => (
                      <option key={fw.filename} value={fw.filename}>
                        {fw.filename}
                      </option>
                    )
                  )}
                </select>
              </div>
            ))}
            <div style={{ marginTop: 15 }}>
              <button
                className="device-config-button"
                style={{ backgroundColor: "#28a745" }}
                onClick={confirmModal}
              >
                Iniciar Atualização
              </button>
              <button
                className="device-config-button"
                style={{ backgroundColor: "#dc3545", marginLeft: 10 }}
                onClick={() => setShowModal(false)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;
