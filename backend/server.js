// /opt/genieacs-dashboard/backend/server.js

const express = require("express");
const nodemailer = require("nodemailer");
const mongoose = require("mongoose");
const cors = require("cors");
const crypto = require("crypto");
// Se Node < 18, descomente a linha abaixo:
// const fetch = require("node-fetch");
// Importação dinâmica do node-fetch para suportar ESM
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));
const morgan = require("morgan");
const path = require("path");

require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

// ------------------------------------------------
// MIDDLEWARES GERAIS
// ------------------------------------------------
app.use(morgan("dev"));
app.use(cors());
app.use(express.json());

// ① Configuração do Nodemailer (exemplo com Gmail; substitua pelas suas credenciais)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,      // e-mail de envio
    pass: process.env.EMAIL_PASS,      // senha ou App Password
  },
});

// ── 1) Novo modelo de audit log ────────────────────
const ChangeLog = mongoose.model("ChangeLog", new mongoose.Schema({
  serial: { type: String, required: true },      // serial da CPE
  user:   { type: String, required: true },      // quem realizou
  action: { type: String, required: true },      // ex: 'setPppoe', 'reboot'
  details: mongoose.Schema.Types.Mixed,          // payload ou diff
  timestamp: { type: Date, default: Date.now },  // quando
}));

// ── 2) Middleware simples para checar admin ───────
function checkAdmin(req, res, next) {
  const role = req.header("x-user-role");
  if (role !== "admin") {
    return res.status(403).json({ error: "Acesso negado: só admins." });
  }
  next();
}

// ------------------------------------------------
// FUNÇÕES AUXILIARES (hash de senha, salt, etc.)
// ------------------------------------------------
function generateSalt(length = 16) {
  return crypto.randomBytes(length).toString("hex");
}
function hashPassword(password, salt) {
  return crypto.createHmac("sha256", salt).update(password).digest("hex");
}

// ------------------------------------------------
// CONEXÃO COM MONGODB
// ------------------------------------------------
mongoose
  .connect("mongodb://127.0.0.1:27017/genieacs", {
    // opções de conexão se necessário
  })
  .then(() => console.log("MongoDB conectado"))
  .catch((err) => console.error("Erro ao conectar ao MongoDB:", err));

// ------------------------------------------------
// MODELS / VARIÁVEIS GLOBAIS
// ------------------------------------------------
// Usamos um schema "flexível" (strict: false) para capturar qualquer campo TR-069
const Device = mongoose.model("devices", new mongoose.Schema({}, { strict: false }));

// === NOVO: coleção de backups de configuração completa da CPE ===
const ConfigBackup = mongoose.model(
  "ConfigBackup",
  new mongoose.Schema({
    serial: { type: String, unique: true },
    connectionMac: String,
    pppoeUsername: String,
    wifiNetworks: Array,
    lastUpdated: Date,
  })
);

// === NOVO: coleção de eventos de reset detectados ===
const ResetEvent = mongoose.model(
  "ResetEvent",
  new mongoose.Schema({
    serial: String,
    connectionMac: String,
    resetAt: Date,
    // configuração _antes_ do reset
    linkedConfig: mongoose.Schema.Types.Mixed,
    // configuração _após_ do reset
    resetConfig: mongoose.Schema.Types.Mixed,
    processed: { type: Boolean, default: false },
  })
);

// Cache em memória para armazenar o array já "formatado" de dispositivos
let lastFormattedDevices = [];

/**
 * ============================
 * LÓGICA DE FORMATAÇÃO (BACKGROUND)
 * ============================
 *  1) Trazer os documentos com `lean()`.
 *  2) Processar mesh/secundários.
 *  3) Guardar resultado em `formattedDevices`.
 *  4) Atualizar `lastFormattedDevices`.
 *  5) **Novo**: gravar backup e detectar resets.
 */
async function rebuildDevicesCache() {
  try {
    const mercusysModels = ["MR30G", "MR60X", "MR50G", "AC12G"];

    // 1) Trazer dos documentos apenas os campos necessários, EM MODO lean()
    const devices = await Device.find(
      {},
      {
        "_id": 1,
        "_deviceId._SerialNumber": 1,
        "_deviceId._Manufacturer": 1,
        "_deviceId._ProductClass": 1,
        "_deviceId._OUI": 1,
        "_lastInform": 1,
        "InternetGatewayDevice.DeviceInfo.SerialNumber": 1,
        "InternetGatewayDevice.DeviceInfo.Manufacturer": 1,
        "InternetGatewayDevice.DeviceInfo.ModelName": 1,
        "InternetGatewayDevice.DeviceInfo.ProductClass": 1,
        "InternetGatewayDevice.DeviceInfo.SoftwareVersion": 1,
        "InternetGatewayDevice.DeviceInfo.UpTime": 1,
        "InternetGatewayDevice.DeviceInfo.HardwareVersion": 1,
        "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress": 1,
        "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ExternalIPAddress": 1,
        "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.MACAddress": 1,
        "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.MACAddress": 1,
        "InternetGatewayDevice.WANDevice.2.WANConnectionDevice.1.WANIPConnection.1.MACAddress": 1,
        "InternetGatewayDevice.WANDevice.2.WANConnectionDevice.1.WANPPPConnection.1.MACAddress": 1,
        "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username": 1,
        "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Password": 1,
        "InternetGatewayDevice.WANDevice.2.WANConnectionDevice.1.WANPPPConnection.1.Username": 1,
        "InternetGatewayDevice.WANDevice.2.WANConnectionDevice.1.WANPPPConnection.1.Password": 1,
        "InternetGatewayDevice.ManagementServer.ConnectionRequestUsername": 1,
        "InternetGatewayDevice.WiFi.MultiAP.APDevice": 1,
        "InternetGatewayDevice.LANDevice.1.Hosts": 1,
        "InternetGatewayDevice.LANDevice.1.WLANConfiguration": 1,
        "InternetGatewayDevice.WiFi.MultiAP.Enable": 1,
        "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DNSServers": 1,
        "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPInterface.1.IPInterfaceIPAddress": 1,
        "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPRouters": 1,
        "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MinAddress": 1,
        "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MaxAddress": 1,
      }
    )
      .lean()
      .exec();

    const deviceMap = new Map();
    const secondaryDevices = new Map();
    const formattedDevices = [];

    // Montar mapa de serial → documento
    devices.forEach((d) => {
      const snNode = d.InternetGatewayDevice?.DeviceInfo?.SerialNumber;
      const serial = snNode?._value || d._deviceId?._SerialNumber || "N/A";
      deviceMap.set(serial, d);
    });

    // Para cada documento, extrair e montar o objeto formatado
    for (const doc of devices) {
      // Extrair serial, manufacturer, model, versions, uptime, lastInform
      const snNode = doc.InternetGatewayDevice?.DeviceInfo?.SerialNumber;
      const serial =
        snNode?._value || doc._deviceId?._SerialNumber || "N/A";

      const manufacturer =
        doc.InternetGatewayDevice?.DeviceInfo?.Manufacturer?._value ||
        doc._deviceId?._Manufacturer ||
        "N/A";

      const model =
        doc.InternetGatewayDevice?.DeviceInfo?.ModelName?._value ||
        doc.InternetGatewayDevice?.DeviceInfo?.ProductClass?._value ||
        doc._deviceId?._ProductClass ||
        "N/A";

      const softwareVersion =
        doc.InternetGatewayDevice?.DeviceInfo?.SoftwareVersion?._value ||
        "N/A";

      const hardwareVersion =
        doc.InternetGatewayDevice?.DeviceInfo?.HardwareVersion?._value ||
        "N/A";

      const deviceUpTime =
        doc.InternetGatewayDevice?.DeviceInfo?.UpTime?._value || 0;
      const lastInform = doc._lastInform || null;

      // Calcular status (online / alert / offline)
      let status = "offline";
      if (lastInform) {
        const ts = new Date(lastInform).getTime();
        const diffSec = (Date.now() - ts) / 1000;
        if (diffSec < 240) status = "online";
        else if (diffSec < 360) status = "alert";
        else status = "offline";
      }

      // Extrair externalIP
      let externalIP = "N/A";
      if (manufacturer === "FiberHome") {
        externalIP =
          doc.InternetGatewayDevice?.WANDevice?.["1"]?.WANConnectionDevice?.["1"]?.WANPPPConnection?.["1"]?.ExternalIPAddress?._value ||
          doc.InternetGatewayDevice?.WANDevice?.["1"]?.WANConnectionDevice?.["1"]?.WANIPConnection?.["1"]?.ExternalIPAddress?._value ||
          "N/A";
      } else {
        externalIP =
          doc.InternetGatewayDevice?.WANDevice?.["1"]?.WANConnectionDevice?.["1"]?.WANPPPConnection?.["1"]?.ExternalIPAddress?._value ||
          "N/A";
      }

      // Extrair connectionMac
      let connectionMac =
        doc.InternetGatewayDevice?.WANDevice?.["1"]?.WANConnectionDevice?.["1"]?.WANIPConnection?.["1"]?.MACAddress?._value ||
        doc.InternetGatewayDevice?.WANDevice?.["1"]?.WANConnectionDevice?.["1"]?.WANPPPConnection?.["1"]?.MACAddress?._value ||
        doc.InternetGatewayDevice?.WANDevice?.["2"]?.WANConnectionDevice?.["1"]?.WANIPConnection?.["1"]?.MACAddress?._value ||
        doc.InternetGatewayDevice?.WANDevice?.["2"]?.WANConnectionDevice?.["1"]?.WANPPPConnection?.["1"]?.MACAddress?._value ||
        "N/A";

      // Extrair PPPoE username/password
      let pppoeUsername = "";
      let pppoePassword = "";
      const wan1 =
        doc.InternetGatewayDevice?.WANDevice?.["1"]?.WANConnectionDevice?.["1"]?.WANPPPConnection?.["1"];
      const wan2 =
        doc.InternetGatewayDevice?.WANDevice?.["2"]?.WANConnectionDevice?.["1"]?.WANPPPConnection?.["1"];
      if (wan1?.Username?._value) {
        pppoeUsername = wan1.Username._value;
        pppoePassword = wan1.Password?._value || "";
      } else if (wan2?.Username?._value) {
        pppoeUsername = wan2.Username._value;
        pppoePassword = wan2.Password?._value || "";
      }

      // Extrair ConnectionRequestUsername
      const connectionRequestUsername =
        doc.InternetGatewayDevice?.ManagementServer?.ConnectionRequestUsername?._value ||
        "";

      // Extrair Wi-Fi networks
      let wifiNetworks = [];
      const wlanConfig =
        doc.InternetGatewayDevice?.LANDevice?.["1"]?.WLANConfiguration;
      if (wlanConfig) {
        Object.entries(wlanConfig).forEach(([index, wc]) => {
          const ssid = wc.SSID?._value || "";
          const passphrase = wc.KeyPassphrase?._value || "";
          const enableRaw = wc.Enable?._value;
          const enable =
            enableRaw === "1" || enableRaw === "true" || enableRaw === true;
          wifiNetworks.push({ index, ssid, passphrase, enable });
        });
      }
      
      // Extrair DNS primário e secundário
      let dnsServers = "";
      const dnsNode =
      doc.InternetGatewayDevice?.LANDevice?.["1"]
     ?.LANHostConfigManagement?.DNSServers?._value;
      if (dnsNode) {
      // O valor já costuma vir como "8.8.8.8,1.1.1.1"
        dnsServers = dnsNode;
    }
      
      // Extrair IP de LAN
const lanIpNode =
  doc.InternetGatewayDevice?.LANDevice?.["1"]
     ?.LANHostConfigManagement
     ?.IPInterface?.["1"]
     ?.IPInterfaceIPAddress?._value;
const lanIp = lanIpNode || "N/A";

      // Extrair DHCP
const dhcpGateway =
  doc.InternetGatewayDevice?.LANDevice?.["1"]
     ?.LANHostConfigManagement
     ?.IPRouters?._value || "";
const dhcpMin =
  doc.InternetGatewayDevice?.LANDevice?.["1"]
     ?.LANHostConfigManagement
     ?.MinAddress?._value || "";
const dhcpMax =
  doc.InternetGatewayDevice?.LANDevice?.["1"]
     ?.LANHostConfigManagement
     ?.MaxAddress?._value || "";
      
      let multiapEnabled = false;
      const multiapNode = doc.InternetGatewayDevice?.WiFi?.MultiAP?.Enable;
      if (multiapNode?._value) {
        const v = multiapNode._value.toString().toLowerCase();
        multiapEnabled = (v === "1" || v === "true");
      }

      // Extrair connectedHosts
      let connectedDevices = [];
      if (
        doc.InternetGatewayDevice?.LANDevice?.["1"]?.Hosts?.Host
      ) {
        connectedDevices = Object.values(
          doc.InternetGatewayDevice.LANDevice["1"].Hosts.Host
        ).map((host) => ({
          mac: host.MACAddress?._value || "N/A",
          hostname: host.HostName?._value || "N/A",
          ip: host.IPAddress?._value || "N/A",
        }));
      }

      // Lógica de mesh/secundários
      let meshStatus = "";
      let principalSerial = null;

      if (
        manufacturer === "FiberHome" &&
        doc.InternetGatewayDevice?.WiFi?.MultiAP?.APDevice
      ) {
        Object.values(
          doc.InternetGatewayDevice.WiFi.MultiAP.APDevice
        ).forEach((ap) => {
          if (
            ap.MACAddress?._value &&
            ap.Manufacturer?._value === "MERCUSYS" &&
            mercusysModels.includes(
              ap.ProductClass?._value.toUpperCase()
            )
          ) {
            let extractedSerial = ap.MACAddress._value
              .replace(/:/g, "")
              .toUpperCase();
            if (!secondaryDevices.has(extractedSerial)) {
              secondaryDevices.set(extractedSerial, serial);
              formattedDevices.push({
                deviceId: null,
                serial: extractedSerial,
                manufacturer: "MERCUSYS",
                model: ap.ProductClass?._value || "N/A",
                softwareVersion: "N/A",
                hardwareVersion: "N/A",
                externalIP: "N/A",
                connectionMac: "N/A",
                meshStatus: `Em Mesh com: ${serial}`,
                principalSerial: serial,
                pppoeUsername: "",
                pppoePassword: "",
                deviceUpTime: 0,
                wifiNetworks: [],
                connectedDevices: [],
                lastInform,
                status,
                multiapEnabled,
                dnsServers,
                lanIp,
                dhcpGateway,
                dhcpMin,
                dhcpMax,
              });
            }
            meshStatus = "MESH";
            principalSerial = serial;
          }
        });
      }

      if (
        manufacturer === "FiberHome" &&
        doc.InternetGatewayDevice?.LANDevice?.["1"]?.Hosts?.Host
      ) {
        Object.values(
          doc.InternetGatewayDevice.LANDevice["1"].Hosts.Host
        ).forEach((host) => {
          const hostName =
            host.HostName?._value?.trim().toUpperCase() || "";
          if (mercusysModels.includes(hostName)) {
            let extractedSerial = host.MACAddress?._value
              .replace(/:/g, "")
              .toUpperCase();
            if (extractedSerial && !secondaryDevices.has(extractedSerial)) {
              secondaryDevices.set(extractedSerial, serial);
              formattedDevices.push({
                deviceId: null,
                serial: extractedSerial,
                manufacturer: "MERCUSYS",
                model: host.HostName?._value || "N/A",
                softwareVersion: "N/A",
                hardwareVersion: "N/A",
                externalIP: "N/A",
                connectionMac: "N/A",
                meshStatus: `Conectado via LAN em: ${serial}`,
                principalSerial: serial,
                pppoeUsername: "",
                pppoePassword: "",
                deviceUpTime: 0,
                wifiNetworks: [],
                connectedDevices: [],
                lastInform,
                status,
                dnsServers,
                lanIp,
                dhcpGateway,
                dhcpMin,
                dhcpMax,
              });
            }
            if (!meshStatus) {
              meshStatus = "PRINCIPAL";
              principalSerial = serial;
            }
          }
        });
      }

      if (
        manufacturer !== "FiberHome" &&
        externalIP === "N/A" &&
        connectionRequestUsername
      ) {
        let splitted = connectionRequestUsername.split("-");
        let extractedSerial = splitted[splitted.length - 1] || "";
        if (!deviceMap.has(extractedSerial)) {
          extractedSerial = connectionRequestUsername;
        }
        if (deviceMap.has(extractedSerial)) {
          meshStatus = `Em Mesh com: ${extractedSerial}`;
          principalSerial = extractedSerial;
          secondaryDevices.set(serial, principalSerial);
        }
      }

      if (!meshStatus && manufacturer === "FiberHome") {
        meshStatus = "PRINCIPAL";
        principalSerial = serial;
      } else if (!meshStatus && manufacturer !== "FiberHome") {
        if (externalIP !== "N/A") {
          meshStatus = "PRINCIPAL";
          principalSerial = serial;
        } else {
          meshStatus = "Em Mesh com: ???";
          principalSerial = "???";
        }
      }

      formattedDevices.push({
        deviceId: `${doc._deviceId?._OUI || "N/A"}-${doc._deviceId?._ProductClass || "N/A"}-${doc._deviceId?._SerialNumber || "N/A"}`,
        serial,
        manufacturer,
        model,
        softwareVersion,
        hardwareVersion,
        externalIP,
        connectionMac,
        meshStatus,
        principalSerial,
        pppoeUsername,
        pppoePassword,
        deviceUpTime,
        wifiNetworks,
        connectedDevices,
        lastInform,
        status,
        multiapEnabled,
        dnsServers,
        lanIp,
        dhcpGateway,
        dhcpMin,
        dhcpMax,
      });
    }

    // Ajustes finais de mesh
    formattedDevices.forEach((dev) => {
      if (
        [...secondaryDevices.values()].includes(dev.serial) &&
        dev.externalIP !== "N/A"
      ) {
        dev.meshStatus = "PRINCIPAL";
        dev.principalSerial = dev.serial;
      }
    });
    formattedDevices.forEach((dev) => {
      if (dev.meshStatus === "PRINCIPAL") {
        const hasMeshChild = formattedDevices.some(
          (child) => child.meshStatus === `Em Mesh com: ${dev.serial}`
        );
        if (hasMeshChild) {
          dev.meshStatus = "MESH";
        }
      }
    });
    formattedDevices.forEach((dev) => {
      if (dev.meshStatus === "PRINCIPAL") {
        const hasChild = formattedDevices.some(
          (child) =>
            child.principalSerial === dev.serial &&
            (child.meshStatus.startsWith("Em Mesh") ||
              child.meshStatus.startsWith("Conectado via LAN"))
        );
        if (!hasChild) {
          dev.meshStatus = "";
        }
      }
    });

    // === NOVO: BACKUP & DETECÇÃO DE RESETS ===
    for (const dev of formattedDevices) {
      const userLow = (dev.pppoeUsername || "").toLowerCase();

      if (userLow && userLow !== "reset") {
        await ConfigBackup.findOneAndUpdate(
          { serial: dev.serial },
          {
            serial: dev.serial,
            connectionMac: dev.connectionMac,
            pppoeUsername: dev.pppoeUsername,
            wifiNetworks: dev.wifiNetworks,
            lastUpdated: new Date(),
          },
          { upsert: true }
        );
      }

      // 2) Só crio ResetEvent se:
      //    a) o usuário atual FOR 'reset'
      //    b) já existia um ConfigBackup anterior
      //    c) esse backup tinha pppoeUsername diferente de 'reset'
      if (userLow === "reset") {
        const backup = await ConfigBackup.findOne({ serial: dev.serial });
        if (backup && backup.connectionMac === dev.connectionMac) {
          const exists = await ResetEvent.findOne({ serial: dev.serial, processed: false });
          if (!exists) {
            await ResetEvent.create({
              serial: dev.serial,
              connectionMac: dev.connectionMac,
              resetAt: new Date(dev.lastInform),
              linkedConfig: backup,
              resetConfig: {
                pppoeUsername: dev.pppoeUsername,
                wifiNetworks: dev.wifiNetworks,
              },
              processed: false,
            });
          }
        }
      }
    }

    // 5) Atualiza cache global
    lastFormattedDevices = formattedDevices;
    console.log(`[${new Date().toISOString()}] Cache de dispositivos atualizado. Total: ${formattedDevices.length}`);
  } catch (err) {
    console.error("Erro ao rebuildDevicesCache():", err);
  }
}

// Primeira execução e agendamento
rebuildDevicesCache();
setInterval(rebuildDevicesCache, 60 * 1000);

// ------------------------------------------------
// ROTAS DE PROXY E LÓGICA DE API
// ------------------------------------------------

app.get("/genieacs/files", async (req, res) => {
  try {
    const queryParam = req.query.query || "{}";
    const url = `http://10.34.250.168:7557/files?query=${encodeURIComponent(queryParam)}`;
    const fetchRes = await fetch(url);
    if (!fetchRes.ok) {
      return res
        .status(fetchRes.status)
        .send(`Erro ao buscar firmwares do GenieACS: status ${fetchRes.status}`);
    }
    const data = await fetchRes.json();
    return res.json(data);
  } catch (error) {
    console.error("Erro no proxy /genieacs/files:", error);
    return res.status(500).send("Erro interno no proxy");
  }
});

app.get("/devices", (req, res) => {
  return res.json(lastFormattedDevices);
});

// Após (filtra somente principais):
app.get("/devices/recent", (req, res) => {
  const limit = parseInt(req.query.limit) || 10;

  // Função que detecta secundários
  const isSecondary = (dev) => {
    const s = dev.meshStatus || "";
    return s.startsWith("Em Mesh") || s.startsWith("Conectado via LAN");
  };

  // 1) pega só os principais
  const primaries = lastFormattedDevices.filter(
    (d) => d.lastInform && !isSecondary(d)
  );

  // 2) ordena e limita
  const sorted = primaries
    .sort((a, b) => new Date(b.lastInform) - new Date(a.lastInform))
    .slice(0, limit);

  res.json(sorted);
});


app.get("/devices/serial/:serial", (req, res) => {
  const { serial } = req.params;
  const found = lastFormattedDevices.find((d) => d.serial === serial);
  if (!found) {
    return res.status(404).json({ error: "Dispositivo não encontrado" });
  }
  return res.json(found);
});

app.get("/devices/serial/:serial/gponpower", async (req, res) => {
  try {
    const { serial } = req.params;
    const deviceDoc = await Device.findOne(
      {
        $or: [
          { "InternetGatewayDevice.DeviceInfo.SerialNumber._value": serial },
          { "_deviceId._SerialNumber": serial },
        ],
      },
      { "InternetGatewayDevice.WANDevice": 1 }
    ).lean();

    if (!deviceDoc) {
      return res.status(404).json({ error: "Dispositivo não encontrado" });
    }
    let gponConfig = null;
    if (deviceDoc.InternetGatewayDevice?.WANDevice) {
      for (const key in deviceDoc.InternetGatewayDevice.WANDevice) {
        const candidate = deviceDoc.InternetGatewayDevice.WANDevice[key];
        if (candidate && candidate.X_FH_GponInterfaceConfig) {
          gponConfig = candidate.X_FH_GponInterfaceConfig;
          break;
        }
      }
    }
    const RXPower =
      gponConfig && gponConfig.RXPower && gponConfig.RXPower._value
        ? gponConfig.RXPower._value
        : "N/A";
    const TXPower =
      gponConfig && gponConfig.TXPower && gponConfig.TXPower._value
        ? gponConfig.TXPower._value
        : "N/A";
    return res.json({ RXPower, TXPower });
  } catch (error) {
    console.error("Erro ao buscar informações GPON:", error);
    return res.status(500).json({ error: "Erro interno no servidor" });
  }
});

app.get("/devices/serial/:serial/lastDownload", async (req, res) => {
  try {
    const { serial } = req.params;

    const doc = await mongoose.connection.db
      .collection("devices")
      .findOne(
        {
          $or: [
            { "InternetGatewayDevice.DeviceInfo.SerialNumber._value": serial },
            { "_deviceId._SerialNumber": serial },
          ],
        },
        { projection: { Downloads: 1 } }
      );

    console.log("DEBUG /lastDownload doc:", JSON.stringify(doc, null, 2));

    if (!doc || !doc.Downloads) {
      return res.json({ lastDownload: null });
    }
    const idx = Object.keys(doc.Downloads)[0];
    const lastObj = doc.Downloads[idx]?.LastDownload;
    const last =
      lastObj && lastObj._value ? lastObj._value.toISOString() : null;
    return res.json({ lastDownload: last });
  } catch (err) {
    console.error("Erro ao buscar lastDownload:", err);
    return res.status(500).json({ lastDownload: null });
  }
});

// POST /devices/serial/:serial/setPppoe
app.post("/devices/serial/:serial/setPppoe", async (req, res) => {
  try {
    const { serial } = req.params;
    const { user: pppoUser, pass } = req.body;
    const callingUser = req.header("x-username") || "unknown";

    const found = lastFormattedDevices.find(d => d.serial === serial);
    if (!found) return res.status(404).json({ error: "Dispositivo não encontrado" });
    if (!found.deviceId) return res.status(400).json({ error: "Secundário, sem config." });

    const parameterValues = [];
    if (pppoUser?.trim()) parameterValues.push([
      "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username",
      pppoUser
    ]);
    if (pass?.trim())      parameterValues.push([
      "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Password",
      pass
    ]);
    if (!parameterValues.length) {
      return res.status(400).json({ error: "Nenhum parâmetro para atualizar" });
    }

    const newTask = {
      name:            "setParameterValues",
      device:          found.deviceId,
      parameterValues,
      created:         new Date(),
      expiry:          new Date(Date.now() + 3600_000),
    };
    const result = await mongoose.connection.db.collection("tasks").insertOne(newTask);

    // atualiza cache
    found.pppoeUsername = pppoUser;
    found.pppoePassword = pass;

    // grava audit log
    await ChangeLog.create({
      serial,
      user:    callingUser,
      action:  "setPppoe",
      details: { user: pppoUser }
    });

    return res.json({
      success: true,
      message: "Tarefa PPPoE criada!",
      taskId:  result.insertedId
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Falha ao inserir setPppoe" });
  }
});

// POST /devices/serial/:serial/setWifi
app.post("/devices/serial/:serial/setWifi", async (req, res) => {
  try {
    const { serial } = req.params;
    const { index, ssid, passphrase } = req.body;
    const callingUser = req.header("x-username") || "unknown";

    const found = lastFormattedDevices.find(d => d.serial === serial);
    if (!found) return res.status(404).json({ error: "Dispositivo não encontrado" });
    if (!found.deviceId) return res.status(400).json({ error: "Secundário, sem config." });

    if (index === undefined) {
      return res.status(400).json({ error: "Falta índice da WLANConfiguration" });
    }

    const parameterValues = [];
    if (typeof ssid === "string" && ssid.trim()) {
      parameterValues.push([
        `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${index}.SSID`,
        ssid
      ]);
    }
    if (typeof passphrase === "string" && passphrase.trim()) {
      // adapte conforme fabricante...
      parameterValues.push([
        `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${index}.KeyPassphrase`,
        passphrase
      ]);
    }
    if (!parameterValues.length) {
      return res.status(400).json({ error: "Nenhum parâmetro para atualizar" });
    }

    const newTask = {
      name:            "setParameterValues",
      device:          found.deviceId,
      parameterValues,
      created:         new Date(),
      expiry:          new Date(Date.now() + 3600_000),
    };
    const result = await mongoose.connection.db.collection("tasks").insertOne(newTask);

    // atualiza cache
    found.wifiNetworks = found.wifiNetworks.map(n =>
      n.index.toString() === index.toString()
        ? { ...n, ssid, passphrase }
        : n
    );

    // grava audit log
    await ChangeLog.create({
      serial,
      user:    callingUser,
      action:  "setWifi",
      details: { index, ssid }
    });

    return res.json({
      success: true,
      message: "Tarefa Wi-Fi criada!",
      taskId:  result.insertedId
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Falha ao inserir setWifi" });
  }
});

// POST /devices/serial/:serial/setMultiAP
app.post("/devices/serial/:serial/setMultiAP", async (req, res) => {
  try {
    const { serial } = req.params;
    const { enable } = req.body;
    const callingUser = req.header("x-username") || "unknown";

    const found = lastFormattedDevices.find(d => d.serial === serial);
    if (!found) return res.status(404).json({ error: "Dispositivo não encontrado" });
    if (!found.deviceId) return res.status(400).json({ error: "Secundário, sem deviceId" });

    const parameterValues = [
      ["InternetGatewayDevice.WiFi.MultiAP.Enable", enable ? "true" : "false"]
    ];

    const newTask = {
      name:            "setParameterValues",
      device:          found.deviceId,
      parameterValues,
      created:         new Date(),
      expiry:          new Date(Date.now() + 3600_000),
    };
    const result = await mongoose.connection.db.collection("tasks").insertOne(newTask);

    // atualiza cache
    found.multiapEnabled = enable;

    // grava audit log
    await ChangeLog.create({
      serial,
      user:    callingUser,
      action:  "setMultiAP",
      details: { enable }
    });

    return res.json({
      success: true,
      message: `MultiAP ${enable ? "ativado" : "desativado"}!`,
      taskId:  result.insertedId
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Falha ao inserir setMultiAP" });
  }
});

// POST /devices/serial/:serial/setDhcp
app.post("/devices/serial/:serial/setDhcp", async (req, res) => {
  try {
    const { serial } = req.params;
    const { gateway, min, max, dnsServers } = req.body;
    const callingUser = req.header("x-username") || "unknown";

    const found = lastFormattedDevices.find(d => d.serial === serial);
    if (!found) return res.status(404).json({ error: "Dispositivo não encontrado" });
    if (!found.deviceId) return res.status(400).json({ error: "Secundário, sem deviceId" });

    const oldLanIp   = found.lanIp;
    const currentDns = found.dnsServers || "";

    const parameterValues = [];
    if (gateway) {
      parameterValues.push([
        "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPRouters",
        gateway
      ], [
        "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPInterface.1.IPInterfaceIPAddress",
        gateway
      ]);
      found.dhcpGateway = gateway;
      found.lanIp        = gateway;
    }
    if (min) {
      parameterValues.push([
        "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MinAddress",
        min
      ]);
      found.dhcpMin = min;
    }
    if (max) {
      parameterValues.push([
        "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MaxAddress",
        max
      ]);
      found.dhcpMax = max;
    }
    if (dnsServers?.trim()) {
      parameterValues.push([
        "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DNSServers",
        dnsServers
      ]);
      found.dnsServers = dnsServers;
    } else if (gateway && currentDns === oldLanIp) {
      parameterValues.push([
        "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DNSServers",
        gateway
      ]);
      found.dnsServers = gateway;
    }

    if (!parameterValues.length) {
      return res.status(400).json({ error: "Nenhum parâmetro para atualizar" });
    }

    const newTask = {
      name:            "setParameterValues",
      device:          found.deviceId,
      parameterValues,
      created:         new Date(),
      expiry:          new Date(Date.now() + 3600_000),
    };
    const result = await mongoose.connection.db.collection("tasks").insertOne(newTask);

    // grava audit log
    await ChangeLog.create({
      serial,
      user:    callingUser,
      action:  "setDhcp",
      details: { gateway, min, max, dnsServers }
    });

    return res.json({
      success: true,
      message: "Configuração DHCP inserida!",
      taskId:  result.insertedId
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Falha ao inserir setDhcp" });
  }
});

app.post("/devices/serial/:serial/reboot", async (req, res) => {
  try {
    const { serial } = req.params;
    const callingUser = req.header("x-username") || "unknown";

    const found = lastFormattedDevices.find(d => d.serial === serial);
    if (!found) return res.status(404).json({ error: "Dispositivo não encontrado" });
    if (!found.deviceId) return res.status(400).json({ error: "Sem deviceId" });

    const newTask = {
      name:    "reboot",
      device:  found.deviceId,
      created: new Date(),
      expiry:  new Date(Date.now() + 3600_000),
    };
    const result = await mongoose.connection.db.collection("tasks").insertOne(newTask);

    await ChangeLog.create({
      serial,
      user:   callingUser,
      action: "reboot",
      details:{}
    });

    return res.json({
      success: true,
      message: "Reboot enviado!",
      taskId:  result.insertedId
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Falha ao inserir reboot" });
  }
});

app.post("/devices/serial/:serial/factoryReset", async (req, res) => {
  try {
    const { serial } = req.params;
    const callingUser = req.header("x-username") || "unknown";

    const found = lastFormattedDevices.find(d => d.serial === serial);
    if (!found) return res.status(404).json({ error: "Dispositivo não encontrado" });
    if (!found.deviceId) return res.status(400).json({ error: "Sem deviceId" });

    const fetchUrl = `http://10.34.250.168:7557/devices/${found.deviceId}/tasks?timeout=3000&connection_request`;
    const fetchRes = await fetch(fetchUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "factoryReset" }),
    });
    if (!fetchRes.ok) {
      const txt = await fetchRes.text();
      return res.status(fetchRes.status).json({ error: txt });
    }

    await ChangeLog.create({
      serial,
      user:   callingUser,
      action: "factoryReset",
      details:{}
    });

    return res.json({ success: true, message: "Factory reset enviado!" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Falha ao inserir factoryReset" });
  }
});

app.post("/devices/serial/:serial/upgradeFirmware", async (req, res) => {
  try {
    const { serial }   = req.params;
    const { fileName } = req.body;
    const callingUser  = req.header("x-username") || "unknown";

    const found = lastFormattedDevices.find(d => d.serial === serial);
    if (!found) return res.status(404).json({ error: "Dispositivo não encontrado" });
    if (!found.deviceId) return res.status(400).json({ error: "Sem deviceId" });

    const newTask = {
      name:          "download",
      device:        found.deviceId,
      fileType:      "1 Firmware Upgrade Image",
      fileName,
      targetFileName:"",
      commandKey:    "upgrade",
      created:       new Date(),
      expiry:        new Date(Date.now() + 3600_000),
    };
    const result = await mongoose.connection.db.collection("tasks").insertOne(newTask);

    await ChangeLog.create({
      serial,
      user:    callingUser,
      action:  "upgradeFirmware",
      details: { fileName }
    });

    return res.json({
      success: true,
      message: "Upgrade de firmware criado!",
      taskId:  result.insertedId
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Falha ao inserir upgradeFirmware" });
  }
});

// ── 4) Rotas de auditoria (só admins) ──

// histórico de uma CPE
app.get("/audit/logs/device/:serial", checkAdmin, async (req, res) => {
  const { serial } = req.params;
  const logs = await ChangeLog.find({ serial }).sort({ timestamp: -1 }).lean();
  res.json(logs);
});

// todos os logs
app.get("/admin/audit/logs", checkAdmin, async (req, res) => {
  const logs = await ChangeLog.find({}).sort({ timestamp: -1 }).lean();
  res.json(logs);
});

app.post("/devices/serial/:serial/refreshNow", async (req, res) => {
  try {
    const { serial } = req.params;
    const found = lastFormattedDevices.find((d) => d.serial === serial);
    if (!found) {
      return res
        .status(404)
        .json({ success: false, error: "Dispositivo não encontrado" });
    }
    if (!found.deviceId) {
      return res
        .status(400)
        .json({ success: false, error: "Dispositivo secundário ou sem deviceId" });
    }
    const fetchUrl = `http://10.34.250.168:7557/devices/${found.deviceId}/tasks?connection_request`;
    const bodyData = { name: "refreshObject", objectName: "" };
    const fetchRes = await fetch(fetchUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyData),
    });
    if (!fetchRes.ok) {
      const text = await fetchRes.text();
      return res.status(fetchRes.status).json({ success: false, error: text });
    }
    return res.json({ success: true, message: "Refresh enviado com sucesso!" });
  } catch (error) {
    console.error("Erro no refreshNow:", error);
    return res
      .status(500)
      .json({ success: false, error: "Erro interno ao enviar refresh" });
  }
});

app.post("/removeOfflineCPEs", async (req, res) => {
  try {
    const { thresholdDays } = req.body;
    if (!thresholdDays || isNaN(thresholdDays) || thresholdDays < 1) {
      return res.status(400).json({ error: "thresholdDays inválido" });
    }
    const cutoff = Date.now() - thresholdDays * 24 * 60 * 60 * 1000;

    const olds = lastFormattedDevices.filter((dev) => {
      const last = dev.lastInform ? new Date(dev.lastInform).getTime() : 0;
      return last > 0 && last < cutoff;
    });

    const details = [];
    for (const dev of olds) {
      if (!dev.deviceId) {
        details.push({ serial: dev.serial, status: 400, error: "sem deviceId" });
        continue;
      }

      // 1) Deleta no GenieACS
      const url = `http://10.34.250.168:7557/devices/${dev.deviceId}`;
      let status;
      try {
        const resp = await fetch(url, { method: "DELETE" });
        status = resp.status;
      } catch (err) {
        details.push({ serial: dev.serial, status: 500, error: err.message });
        continue;
      }

      // 2) Deleta também no MongoDB
      await mongoose.connection.db
        .collection("devices")
        .deleteOne({
          $or: [
            { "InternetGatewayDevice.DeviceInfo.SerialNumber._value": dev.serial },
            { "_deviceId._SerialNumber": dev.serial },
          ],
        });

      // 3) Atualiza cache em memória
      lastFormattedDevices = lastFormattedDevices.filter(d => d.serial !== dev.serial);

      details.push({ serial: dev.serial, status });
    }

    return res.json({ removed: details.length, details });
  } catch (err) {
    console.error("Erro em removeOfflineCPEs:", err);
    return res.status(500).json({ error: "Erro interno" });
  }
});

/**
 * DELETE /devices/serial/:serial
 *   → Remove a CPE do GenieACS, do MongoDB "devices" e também do ConfigBackup.
 */
app.delete("/devices/serial/:serial", async (req, res) => {
  try {
    const { serial } = req.params;
    // Encontra no cache o deviceId usado pelo GenieACS
    const found = lastFormattedDevices.find((d) => d.serial === serial);
    if (!found) {
      return res.status(404).json({ error: "Dispositivo não encontrado" });
    }
    if (!found.deviceId) {
      return res.status(400).json({ error: "Dispositivo secundário, sem deviceId" });
    }

    // 1) Remove no GenieACS
    const url = `http://10.34.250.168:7557/devices/${found.deviceId}`;
    let status;
    try {
      const resp = await fetch(url, { method: "DELETE" });
      status = resp.status;
    } catch (err) {
      console.error("Erro ao deletar no GenieACS:", err);
      return res.status(500).json({ error: err.message });
    }

    // 2) Remove no MongoDB (coleção devices)
    await mongoose.connection.db
      .collection("devices")
      .deleteOne({
        $or: [
          { "InternetGatewayDevice.DeviceInfo.SerialNumber._value": serial },
          { "_deviceId._SerialNumber": serial },
        ],
      });

    // 3) Remove o backup desta CPE
    await ConfigBackup.deleteOne({ serial });

    // Atualiza o cache em memória
    lastFormattedDevices = lastFormattedDevices.filter(d => d.serial !== serial);

    return res.json({ success: true, status });
  } catch (err) {
    console.error("Erro ao remover CPE:", err);
    return res.status(500).json({ error: "Erro interno ao remover CPE" });
  }
});

// ------------------------------------------------------
// ROTAS DE USUÁRIOS E AUTENTICAÇÃO
// ------------------------------------------------------

app.get("/db/users", async (req, res) => {
  try {
    const usersCollection = mongoose.connection.db.collection("users");
    const users = await usersCollection.find({}).toArray();
    return res.json(users);
  } catch (err) {
    console.error("Erro ao recuperar usuários:", err);
    return res.status(500).json({ error: err.message });
  }
});

app.post("/db/users", async (req, res) => {
  try {
    const { username, password, role, email, emailRequired } = req.body;
    if (!username || !role) {
      return res.status(400).json({ error: "Parâmetros obrigatórios faltando" });
    }

    const usersCollection = mongoose.connection.db.collection("users");
    if (await usersCollection.findOne({ _id: username })) {
      return res.status(400).json({ error: "Usuário já existe" });
    }

    // ② Se for cadastro com e-mail, gera senha aleatória
    let rawPassword = password;
    if (emailRequired) {
      rawPassword = crypto.randomBytes(4).toString("hex"); // 8 caracteres hex
    }

    const salt = generateSalt(16);
    const hashedPassword = hashPassword(rawPassword, salt);
    const newUser = {
      _id: username,
      password: hashedPassword,
      roles: role,
      salt: salt,
      email: emailRequired ? email : undefined,
      mustChangePassword: !!emailRequired,
    };
    await usersCollection.insertOne(newUser);

    // ③ Se for por e-mail, envia a senha por correio eletrônico
    if (emailRequired && email) {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: "Seu acesso ao ACS Genie-ACS",
        text: `Olá ${username},\n\nSua conta foi criada.\nSenha temporária: ${rawPassword}\nAcesse e troque sua senha no primeiro login.\n\nObrigado.`,
      });
    }

    return res.json({ message: "Usuário criado com sucesso" });
  } catch (err) {
    console.error("Erro ao criar usuário:", err);
    return res.status(500).json({ error: err.message });
  }
});


app.post("/db/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Usuário e senha são obrigatórios" });
    }
    const usersCol = mongoose.connection.db.collection("users");
    const user = await usersCol.findOne({ _id: username });
    if (!user) {
      return res.status(401).json({ error: "Usuário não encontrado" });
    }
    const hashedAttempt = hashPassword(password, user.salt);
    if (hashedAttempt !== user.password) {
      return res.status(401).json({ error: "Credenciais inválidas" });
    }
    const rolesCol = mongoose.connection.db.collection("roles");
    const roleDoc = await rolesCol.findOne({ _id: user.roles });
    const permissions = Array.isArray(roleDoc?.permissions)
      ? roleDoc.permissions
      : [];
    return res.json({
      user: {
        username,
        roles: user.roles,
        permissions,
        mustChangePassword: !!user.mustChangePassword
      },
    });
  } catch (err) {
    console.error("Erro no /db/login:", err);
    return res.status(500).json({ error: "Erro interno" });
  }
});

/**
 * POST /db/users/:username/change-password
 *   → troca a senha sem solicitar a antiga (só recebe { newPassword })
 */
app.post("/db/users/:username/change-password", async (req, res) => {
  try {
    const { username } = req.params;
    const { newPassword } = req.body;
    if (!newPassword) {
      return res.status(400).json({ error: "Nova senha é obrigatória" });
    }
    // validação de senha forte
    const strongRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*\W).+$/;
    if (!strongRegex.test(newPassword)) {
      return res.status(400).json({
        error:
          "Senha deve conter ao menos: uma letra minúscula, uma maiúscula, um número e um símbolo.",
      });
    }

    const usersCol = mongoose.connection.db.collection("users");
    const userDoc = await usersCol.findOne({ _id: username });
    if (!userDoc) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    // gera novo salt e hash
    const salt = generateSalt(16);
    const hashed = hashPassword(newPassword, salt);

    // atualiza senha, salt e limpa mustChangePassword
    await usersCol.updateOne(
      { _id: username },
      {
        $set: {
          password: hashed,
          salt: salt,
          mustChangePassword: false,
        },
      }
    );

    return res.json({ message: "Senha alterada com sucesso" });
  } catch (err) {
    console.error("Erro ao trocar senha:", err);
    return res.status(500).json({ error: "Erro interno ao trocar senha" });
  }
});


app.delete("/db/users/:username", async (req, res) => {
  try {
    const username = req.params.username;
    const usersCollection = mongoose.connection.db.collection("users");
    const result = await usersCollection.deleteOne({ _id: username });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    return res.json({ message: "User deleted" });
  } catch (err) {
    console.error("Erro ao deletar usuário:", err);
    return res.status(500).json({ error: err.message });
  }
});

app.put("/db/users/:username", async (req, res) => {
  try {
    const { username } = req.params;
    const { role } = req.body;
    await mongoose.connection.db
      .collection("users")
      .updateOne({ _id: username }, { $set: { roles: role } });
    return res.json({ ok: true });
  } catch (err) {
    console.error("Erro ao atualizar usuário:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ------------------------------------------------------
// ROTAS DE PERFIS (ROLES)
// ------------------------------------------------------

app.get("/db/roles", async (req, res) => {
  try {
    const rolesCollection = mongoose.connection.db.collection("roles");
    const roles = await rolesCollection.find({}).toArray();
    return res.json(roles);
  } catch (err) {
    console.error("Erro ao recuperar roles:", err);
    return res.status(500).json({ error: err.message });
  }
});

app.post("/db/roles", async (req, res) => {
  try {
    const { roleName, permissions } = req.body;
    if (!roleName || !permissions) {
      return res.status(400).json({ error: "Missing parameters" });
    }
    const rolesCollection = mongoose.connection.db.collection("roles");
    const exists = await rolesCollection.findOne({ _id: roleName });
    if (exists) {
      return res.status(400).json({ error: "Role already exists" });
    }
    const permsArray = Array.isArray(permissions)
      ? permissions
      : permissions.split(",").map((p) => p.trim());
    const newRole = { _id: roleName, permissions: permsArray };
    const result = await rolesCollection.insertOne(newRole);
    return res.json({ message: "Role created", result });
  } catch (err) {
    console.error("Erro ao criar role:", err);
    return res.status(500).json({ error: err.message });
  }
});

app.put("/db/roles/:roleName", async (req, res) => {
  try {
    const { roleName } = req.params;
    const { permissions } = req.body;
    if (!permissions) {
      return res.status(400).json({ error: "Missing permissions" });
    }
    const rolesCollection = mongoose.connection.db.collection("roles");
    const result = await rolesCollection.updateOne(
      { _id: roleName },
      { $set: { permissions } }
    );
    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: "Perfil não encontrado ou sem alteração" });
    }
    return res.json({ message: "Perfil atualizado com sucesso" });
  } catch (err) {
    console.error("Erro ao atualizar perfil:", err);
    return res.status(500).json({ error: err.message });
  }
});

app.delete("/db/roles/:roleName", async (req, res) => {
  try {
    const roleName = req.params.roleName;
    const rolesCollection = mongoose.connection.db.collection("roles");
    const result = await rolesCollection.deleteOne({ _id: roleName });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Role not found" });
    }
    return res.json({ message: "Role deleted" });
  } catch (err) {
    console.error("Erro ao deletar role:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ------------------------------------------------------
// ROTAS DE RELATÓRIOS DE FIRMWARE
// ------------------------------------------------------

app.get("/reports/firmware-updates", async (req, res) => {
  console.log(`[${new Date().toISOString()}] GET /reports/firmware-updates called`);
  try {
    const reports = await mongoose.connection.db
      .collection("firmwareReports")
      .find({})
      .sort({ timestamp: -1 })
      .toArray();

    const successes = reports.filter((r) => r.success);
    const failures = reports.filter((r) => !r.success);

    console.log(`[${new Date().toISOString()}] report successes:`, successes);
    console.log(`[${new Date().toISOString()}] report failures:`, failures);

    return res.json({ successes, failures });
  } catch (err) {
    console.error(
      `[${new Date().toISOString()}] ERROR in GET /reports/firmware-updates:`,
      err
    );
    return res.status(500).json({ error: "Erro interno ao gerar relatório" });
  }
});

app.post("/reports/firmware-updates", async (req, res) => {
  console.log(
    `[${new Date().toISOString()}] POST /reports/firmware-updates called with body:`,
    req.body
  );
  try {
    const { serial, fileName, status, timestamp: bodyTs, error, user } = req.body;
    const isSuccess = status === "success";
    const reportTimestamp = bodyTs ? new Date(bodyTs) : new Date();

    const report = {
      serial,
      fileName,
      success: isSuccess,
      timestamp: reportTimestamp,
      user,
      ...(error && { error }),
    };
    await mongoose.connection.db.collection("firmwareReports").insertOne(report);

    console.log(`[${new Date().toISOString()}] Report inserted:`, report);
    return res.json({ ok: true });
  } catch (err) {
    console.error(
      `[${new Date().toISOString()}] ERROR in POST /reports/firmware-updates:`,
      err
    );
    return res.status(500).json({ error: "Falha ao registrar relatório" });
  }
});

app.delete("/reports/firmware-updates/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { ObjectId } = require("mongodb");
    await mongoose.connection.db
      .collection("firmwareReports")
      .deleteOne({ _id: new ObjectId(id) });
    return res.json({ ok: true });
  } catch (err) {
    console.error("Erro ao deletar relatório:", err);
    return res.status(500).json({ error: "Falha ao deletar relatório" });
  }
});

// ------------------------------------------------------
// NOVAS ROTAS PARA RESET EVENTS
// ------------------------------------------------------

/**
 * GET /reset-events
 *    → retorna todos os eventos de reset não processados
 */
app.get("/api/reset-events", async (req, res) => {
  try {
    const events = await ResetEvent
      .find({ processed: false })
      .sort({ resetAt: -1 })
      .lean();
    return res.json(events);
  } catch (err) {
    console.error("Erro ao buscar reset events:", err);
    return res.status(500).json({ error: "Erro interno ao buscar reset events" });
  }
});

/**
 * POST /reset-events/:id/process
 *    → marca um reset event como processed
 */
app.post("/api/reset-events/:id/process", async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await ResetEvent.findByIdAndUpdate(
      id,
      { processed: true },
      { new: true }
    ).lean().exec(); // .exec() é opcional com await, mas bom ter
    if (!updated) {
      return res.status(404).json({ error: "ResetEvent não encontrado" });
    }
    return res.json({ success: true, event: updated });
  } catch (err) {
    console.error("Erro ao processar reset event:", err);
    return res.status(500).json({ error: "Erro interno ao processar evento" });
  }
});

// ------------------------------------------------------
// SERVE O BUILD DO FRONTEND E "CATCH-ALL"
// ------------------------------------------------------
app.use(express.static(path.join(__dirname, "..", "frontend", "build")));
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "build", "index.html"));
});

// ------------------------------------------------------
// INICIA O SERVIDOR
// ------------------------------------------------------
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor iniciado na porta ${PORT}`);
});