# PLC-DELTA-DVP50MC11T-EXCEL

# 🚀 Delta DVP-50MC PLC Real-Time Excel Data Logging

> **Real-Time Data Acquisition & Analytics System** for Delta DVP-50MC Motion PLC to Microsoft Excel over Modbus TCP Ethernet Protocol.

This project enables real-time logging of manufacturing metrics—including **Total Production Count**, **Shift Target Quota**, **Passed (OK) Quantity**, **Rework Quantity**, **Scrapped Rejections**, **Piece-Level Defect Codes**, and **Target Achievement Rates**—from a **Delta DVP-50MC PLC** directly into an **Excel Spreadsheet (.xlsx / .csv)** during an 8-hour shift.

---

## 📋 Table of Contents
- [Architecture Overview](#-architecture-overview)
- [Software & Hardware Requirements](#-software--hardware-requirements)
- [PLC Register Mapping (Modbus Map)](#-plc-register-mapping-modbus-map)
- [Step-by-Step Implementation Roadmap](#-step-by-step-implementation-roadmap)
  - [Phase 1: Software & Physical Connection Setup](#phase-1-software--physical-connection-setup)
  - [Phase 2: PLC Programming Logic](#phase-2-plc-programming-logic)
  - [Phase 3: Modbus TCP Protocol Setup](#phase-3-modbus-tcp-protocol-setup)
  - [Phase 4: Real-Time Excel Integration](#phase-4-real-time-excel-integration)
  - [Phase 5: 8-Hour Shift Reporting](#phase-5-8-hour-shift-reporting)
- [Complete Real-Time Python Excel Logger Script](#-complete-real-time-python-excel-logger-script)
- [C# .NET Modbus Client Reference](#-c-net-modbus-client-reference)
- [Best Practices & Troubleshooting](#-best-practices--troubleshooting)

---

## 🏗️ Architecture Overview

```
[ Field Sensors / Pushbuttons ]
               │
               ▼
[ Delta DVP-50MC Motion PLC ] ──(Calculates Total, OK, NG, Defect Codes)
               │
               │ (CAT6 Ethernet Cable / Modbus TCP Port 502)
               ▼
[ Host PC Data Collector ]
               │
               ▼
[ Live Excel Log / CSV Report ] ──(Updated every 1-5 sec with Shift Analytics)
```

---

## 💻 Software & Hardware Requirements

### Software Checklist

| Software Name | Purpose | Provider / Source |
| :--- | :--- | :--- |
| **DIADesigner-AX / ISPSoft** | Delta DVP-50MC PLC & Motion Control programming environment (IEC 61131-3 / Ladder Diagram). | Delta Electronics Official Site |
| **COMMGR** | Delta Communication Manager (Manages Ethernet/IP driver between PC and PLC). | Delta Electronics Official Site |
| **CANopen Builder** | Network topology tool for Servo Motion axes (if motion control is used). | Delta Electronics Official Site |
| **Python 3.10+** | Real-time background data logger script to write PLC data into Excel. | Python.org |
| **Microsoft Excel** | Shift reports and live visualization dashboard. | Microsoft 365 |

> 💡 **Technical Note on Delta DVP-50MC:**  
> The **Delta DVP-50MC** is a CODESYS-based high-performance multi-axis motion controller. Communication with external PCs, HMIs, or SCADA systems is conducted over standard Ethernet via **Modbus TCP (Port 502, Slave ID 1)**.

### Hardware Checklist
1. **Delta DVP-50MC Motion Controller PLC**
2. **24V DC Industrial Power Supply**
3. **CAT5e / CAT6 Ethernet Cable** (Direct PC-to-PLC LAN connection)
4. **Machine Field Inputs**:
   - Production Counter Sensor (Photoelectric / Proximity)
   - Quality Inspection Sensor / OK Output Relay
   - Defect Pushbuttons / Rejection Sensors (Dimension, Scratch, Weight)

---

## 📊 PLC Register Mapping (Modbus Map)

Data is stored in PLC internal **D-Registers (Data Registers)** and read over **Modbus Holding Registers**.

| PLC Register | Modbus Register Address | Variable Name | Description | Data Type | Example Value |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **D100** | 40101 (`0x0064`) | `Total_Production` | Total machine production count | INT (16-bit) | `1250` Pcs |
| **D102** | 40103 (`0x0066`) | `Target_Production` | Target quota for 8-hour shift | INT (16-bit) | `1500` Pcs |
| **D104** | 40105 (`0x0068`) | `OK_Count` | Total passed / good quality pieces | INT (16-bit) | `1180` Pcs |
| **D106** | 40107 (`0x006A`) | `Rework_Count` | Pieces assigned for repair / rework | INT (16-bit) | `40` Pcs |
| **D108** | 40109 (`0x006C`) | `Rejection_Count` | Scrapped / rejected pieces | INT (16-bit) | `30` Pcs |
| **D110** | 40111 (`0x006E`) | `Latest_Defect_Code` | Fault reason code (1=Dimension, 2=Scratch, 3=Weight) | INT (16-bit) | `Code 2` |
| **D112** | 40113 (`0x0070`) | `Achievement_Rate` | Target achievement percentage `(OK / Target) * 100` | INT (16-bit) | `78 %` |
| **D114** | 40115 (`0x0072`) | `Machine_Status` | Operational state (1=Running, 2=Idle, 3=Fault) | INT (16-bit) | `1` |

---

## 🛣️ Step-by-Step Implementation Roadmap

### Phase 1: Software & Physical Connection Setup
1. Install **DIADesigner-AX / ISPSoft** and **COMMGR** on the host workstation.
2. Connect Ethernet cable between PC LAN port and PLC LAN port.
3. Configure static IP address on PLC (e.g., `192.168.1.5`, Subnet `255.255.255.0`).
4. Set host PC IP address on the same subnet (e.g., `192.168.1.100`).
5. Open **COMMGR**, add an `Ethernet` driver, scan for the PLC IP, and confirm handshake.

### Phase 2: PLC Programming Logic
In DIADesigner-AX / ISPSoft, write Ladder Diagram logic:
1. **Total Production Counter**: On rising edge of Sensor `X0`: Increment `D100`.
2. **Quality Categorization Counters**:
   - Inspection Passed (`X1`): Increment `D104` (OK Count).
   - Rework Button (`X2`): Increment `D106` (Rework Count).
   - Reject Button (`X3`): Increment `D108` (Rejection Count).
3. **Defect Code Assignment**:
   - Dimension Error (`X4`): Move `1` to `D110`.
   - Surface Scratch (`X5`): Move `2` to `D110`.
   - Weight Error (`X6`): Move `3` to `D110`.
4. **Achievement Percentage Calculation**:
   - `D112 = (D104 * 100) / D102`.

### Phase 3: Modbus TCP Protocol Setup
1. The Delta DVP-50MC listens natively on **Port 502** with **Slave ID 1**.
2. Address mapping: `D[n]` corresponds to Modbus Holding Register address `100 + n`.

### Phase 4: Real-Time Excel Integration
Run the Python data collection service (`plc_excel_logger.py`) in the background. It polls the Modbus registers every 5 seconds and appends continuous time-stamped entries to `Production_Log_RealTime.xlsx`.

### Phase 5: 8-Hour Shift Reporting
Organize the Excel Workbook into two worksheets:
1. `Production_Log`: Row-by-row live production entries with timestamp, shift name, OK count, rework count, rejection count, defect details, and achievement rate.
2. `Shift_Dashboard`: Bar charts for Total vs. Target, donut charts for OK vs. NG ratio, and Pareto charts for defect categories.

---

## 🐍 Complete Real-Time Python Excel Logger Script

### Dependencies Installation:
```bash
pip install pymodbus openpyxl pandas
```

### Script (`plc_excel_logger.py`):

```python
import time
from datetime import datetime
from pymodbus.client import ModbusTcpClient
import openpyxl
import os

# ==========================================
# PLC Configuration Settings
# ==========================================
PLC_IP = "192.168.1.5"    # Delta DVP-50MC IP Address
PLC_PORT = 502
SLAVE_ID = 1

# ==========================================
# Excel Output File Settings
# ==========================================
EXCEL_FILE = "Production_Log_RealTime.xlsx"

def init_excel():
    """Initialize Excel log file with headers if missing."""
    if not os.path.exists(EXCEL_FILE):
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Production_Log"
        headers = [
            "Timestamp", "Shift", "Total Production", "Target", 
            "OK Count", "Rework Count", "Rejection Count", 
            "Defect Code", "Defect Description", "Achievement %"
        ]
        ws.append(headers)
        wb.save(EXCEL_FILE)
        print(f"✅ Excel log file '{EXCEL_FILE}' initialized successfully.")

def get_defect_description(code):
    """Map numerical defect code to description."""
    defects = {
        0: "None / Good Quality",
        1: "Dimension Out of Spec",
        2: "Surface Scratch / Visual Defect",
        3: "Weight Mismatch",
        4: "Assembly Alignment Fault"
    }
    return defects.get(code, f"Unknown Defect ({code})")

def get_current_shift():
    """Determine manufacturing shift based on time."""
    now = datetime.now().time()
    if time(6, 0) <= now < time(14, 0):
        return "Shift A"
    elif time(14, 0) <= now < time(22, 0):
        return "Shift B"
    else:
        return "Shift C"

def read_plc_and_log():
    """Poll PLC registers over Modbus TCP and log into Excel."""
    client = ModbusTcpClient(PLC_IP, port=PLC_PORT)
    
    if not client.connect():
        print(f"❌ Connection Error: Unable to connect to PLC at {PLC_IP}:{PLC_PORT}")
        return

    print(f"✅ Connected to Delta DVP-50MC PLC at {PLC_IP}:{PLC_PORT}")

    init_excel()

    wb = openpyxl.load_workbook(EXCEL_FILE)
    ws = wb["Production_Log"]

    try:
        while True:
            # Read 13 registers starting from address 100 (D100 to D112)
            result = client.read_holding_registers(address=100, count=13, slave=SLAVE_ID)

            if not result.isError():
                regs = result.registers
                total_prod   = regs[0]   # D100
                target_prod  = regs[2]   # D102
                ok_count     = regs[4]   # D104
                rework_count = regs[6]   # D106
                reject_count = regs[8]   # D108
                defect_code  = regs[10]  # D110
                achievement  = regs[12]  # D112

                timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                shift = get_current_shift()
                defect_desc = get_defect_description(defect_code)

                # Append data row
                row = [
                    timestamp, shift, total_prod, target_prod,
                    ok_count, rework_count, reject_count,
                    defect_code, defect_desc, f"{achievement}%"
                ]
                ws.append(row)
                wb.save(EXCEL_FILE)

                print(f"[{timestamp}] {shift} | Total: {total_prod} | OK: {ok_count} | Rework: {rework_count} | Reject: {reject_count} | Defect: {defect_desc} | Achievement: {achievement}%")
            else:
                print("⚠️ Communication Warning: Error reading PLC registers.")

            time.sleep(5)  # Polling interval (5 seconds)

    except KeyboardInterrupt:
        print("\n🛑 Logging session stopped by user.")
    finally:
        client.close()

if __name__ == "__main__":
    read_plc_and_log()
```

---

## 💻 C# .NET Modbus Client Reference

If building a standalone Windows Desktop application (.NET WPF / WinForms):

```csharp
using System;
using System.Net.Sockets;

namespace DeltaDVP50MC
{
    public class ModbusClient
    {
        private TcpClient client;
        private NetworkStream stream;

        public void Connect(string ipAddress, int port = 502)
        {
            client = new TcpClient(ipAddress, port);
            stream = client.GetStream();
        }

        public ushort[] ReadHoldingRegisters(ushort startAddress, ushort count)
        {
            // Modbus TCP Frame Header construction
            byte[] frame = new byte[] {
                0x00, 0x01, // Transaction ID
                0x00, 0x00, // Protocol ID (Modbus)
                0x00, 0x06, // Length
                0x01,       // Unit / Slave ID
                0x03,       // Function Code 3 (Read Holding Registers)
                (byte)(startAddress >> 8), (byte)(startAddress & 0xFF),
                (byte)(count >> 8), (byte)(count & 0xFF)
            };

            stream.Write(frame, 0, frame.Length);

            byte[] buffer = new byte[256];
            int bytesRead = stream.Read(buffer, 0, buffer.Length);

            ushort[] registers = new ushort[count];
            for (int i = 0; i < count; i++)
            {
                registers[i] = (ushort)((buffer[9 + i * 2] << 8) | buffer[10 + i * 2]);
            }
            return registers;
        }

        public void Disconnect()
        {
            stream?.Close();
            client?.Close();
        }
    }
}
```

---

## 🛡️ Best Practices & Troubleshooting

1. **Auto-Reconnect Loop**:
   - Wrap TCP read calls in robust `try/except` reconnect loops to avoid crashes when physical Ethernet links bounce.
2. **Avoiding Excel File Locks (`PermissionError`)**:
   - Opening `.xlsx` files in Excel while a Python script writes to them causes file lock errors.
   - **Solution**: Open Excel files in **Read-Only** mode or output data to a `.csv` log file and link Excel via **Data > Refresh**.
3. **Shift Archives**:
   - Run automated shift archive scripts at the end of each 8-hour shift to generate distinct shift reports (e.g. `Shift_A_2026-09-19.xlsx`).
4. **32-Bit Double Register Reading**:
   - Floating-point numbers or count values > 65,535 span two 16-bit registers. Join them using `(high_reg << 16) | low_reg`.

---
License: MIT - Industrial Automation & Data Logging Template for Delta DVP PLCs.
