from flask import Flask, jsonify
from pymongo import MongoClient

app = Flask(__name__)

# Conectando ao MongoDB
client = MongoClient("mongodb://localhost:27017/")
db = client["genieacs"]

@app.route("/devices", methods=["GET"])
def get_devices():
    devices = db.devices.find({}, {
        "InternetGatewayDevice.DeviceInfo.SerialNumber": 1,
        "InternetGatewayDevice.DeviceInfo.ProductClass": 1,
        "InternetGatewayDevice.DeviceInfo.SoftwareVersion": 1,
        "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ExternalIPAddress": 1
    })

    device_list = []
    for device in devices:
        device_list.append({
            "SerialNumber": device.get("InternetGatewayDevice", {}).get("DeviceInfo", {}).get("SerialNumber", {}).get("_value", "N/A"),
            "ProductClass": device.get("InternetGatewayDevice", {}).get("DeviceInfo", {}).get("ProductClass", {}).get("_value", "N/A"),
            "SoftwareVersion": device.get("InternetGatewayDevice", {}).get("DeviceInfo", {}).get("SoftwareVersion", {}).get("_value", "N/A"),
            "ExternalIPAddress": device.get("InternetGatewayDevice", {}).get("WANDevice", {}).get("1", {}).get("WANConnectionDevice", {}).get("1", {}).get("WANIPConnection", {}).get("1", {}).get("ExternalIPAddress", {}).get("_value", "N/A")
        })

    return jsonify(device_list)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
